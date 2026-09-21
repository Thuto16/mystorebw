# app.py — Main Flask application

import os
import secrets
from functools import wraps
from urllib.parse import quote
from flask import Flask, jsonify, send_from_directory, request
from flask_cors import CORS
from werkzeug.utils import secure_filename
import config
from database import query

# ---- Paths ----
BACKEND_DIR  = os.path.dirname(__file__)
FRONTEND_DIR = os.path.abspath(os.path.join(BACKEND_DIR, "..", "frontend"))
UPLOAD_DIR   = os.path.join(BACKEND_DIR, "uploads")

# Make sure the uploads folder exists
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Only these file types are allowed to be uploaded
ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "webp", "gif"}

# ---- App setup ----
app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path="")
CORS(app)

# In-memory set of active admin login tokens.
# Tokens are lost when the server restarts — she just logs in again.
ACTIVE_TOKENS = set()


# ============================================
# AUTH HELPERS
# ============================================

def admin_required(f):
    """Decorator: blocks a route unless a valid admin token is sent."""
    @wraps(f)
    def wrapper(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        token = auth_header.replace("Bearer ", "").strip()
        if token not in ACTIVE_TOKENS:
            return jsonify({"success": False, "error": "Unauthorized"}), 401
        return f(*args, **kwargs)
    return wrapper


# ============================================
# HEALTH CHECK
# ============================================

@app.route("/health")
def health():
    return jsonify({"status": "ok", "message": "MyStore BW backend is running"})


# ============================================
# PUBLIC PRODUCTS
# ============================================

@app.route("/api/products")
def get_products():
    """Public product listing with optional filters."""
    category  = request.args.get("category")
    search    = request.args.get("search")
    min_price = request.args.get("min_price")
    max_price = request.args.get("max_price")
    limit     = request.args.get("limit", type=int)
    offset    = request.args.get("offset", type=int, default=0)

    sql = ("SELECT id, name, description, price, category, subcategory, image_url "
           "FROM products WHERE is_available = TRUE")
    params = []

    if category:
        sql += " AND category = %s"
        params.append(category)
    if search:
        sql += " AND name LIKE %s"
        params.append(f"%{search}%")
    if min_price:
        sql += " AND price >= %s"
        params.append(min_price)
    if max_price:
        sql += " AND price <= %s"
        params.append(max_price)

    sql += " ORDER BY created_at DESC"

    if limit:
        sql += " LIMIT %s OFFSET %s"
        params.extend([limit, offset])

    rows = query(sql, tuple(params), fetch=True)
    for row in rows:
        row["price"] = float(row["price"])
    return jsonify({"success": True, "count": len(rows), "products": rows})


@app.route("/api/products/<int:product_id>")
def get_product(product_id):
    rows = query(
        "SELECT id, name, description, price, category, subcategory, image_url "
        "FROM products WHERE id = %s",
        (product_id,),
        fetch=True
    )
    if not rows:
        return jsonify({"success": False, "error": "Product not found"}), 404
    product = rows[0]
    product["price"] = float(product["price"])
    return jsonify({"success": True, "product": product})


# ============================================
# PUBLIC ORDERS (customer checkout)
# ============================================

@app.route("/api/orders", methods=["POST"])
def create_order():
    data = request.get_json(silent=True) or {}

    required = ["customer_name", "customer_phone", "location", "items"]
    for field in required:
        if not data.get(field):
            return jsonify({"success": False, "error": f"Missing field: {field}"}), 400

    if not isinstance(data["items"], list) or len(data["items"]) == 0:
        return jsonify({"success": False, "error": "Order must contain at least one item"}), 400

    order_items = []
    total = 0.0

    for item in data["items"]:
        product_id = item.get("product_id")
        quantity = int(item.get("quantity", 1))

        if quantity < 1:
            return jsonify({"success": False, "error": "Quantity must be at least 1"}), 400

        rows = query(
            "SELECT name, price FROM products WHERE id = %s AND is_available = TRUE",
            (product_id,),
            fetch=True
        )
        if not rows:
            return jsonify({"success": False, "error": f"Product {product_id} not available"}), 400

        product = rows[0]
        price = float(product["price"])
        total += price * quantity
        order_items.append({
            "product_id": product_id,
            "product_name": product["name"],
            "price": price,
            "quantity": quantity
        })

    order_id = query(
        """INSERT INTO orders (customer_name, customer_phone, location, notes, total_price)
           VALUES (%s, %s, %s, %s, %s)""",
        (
            data["customer_name"],
            data["customer_phone"],
            data["location"],
            data.get("notes", ""),
            total
        )
    )

    for oi in order_items:
        query(
            """INSERT INTO order_items (order_id, product_id, product_name, price, quantity)
               VALUES (%s, %s, %s, %s, %s)""",
            (order_id, oi["product_id"], oi["product_name"], oi["price"], oi["quantity"])
        )

    lines = [
        "Hi! I'd like to place an order:",
        "",
        f"Order #{order_id}",
        f"Name: {data['customer_name']}",
        f"Phone: {data['customer_phone']}",
        f"Location: {data['location']}",
    ]
    if data.get("notes"):
        lines.append(f"Notes: {data['notes']}")
    lines.append("")
    lines.append("Items:")
    for oi in order_items:
        lines.append(f"• {oi['product_name']} x{oi['quantity']} — P{oi['price'] * oi['quantity']:.2f}")
    lines.append("")
    lines.append(f"Total: P{total:.2f}")

    wa_message = "\n".join(lines)
    wa_number = config.WHATSAPP_NUMBER
    wa_link = f"https://wa.me/{wa_number}?text={quote(wa_message)}" if wa_number else f"https://wa.me/?text={quote(wa_message)}"

    return jsonify({
        "success": True,
        "order_id": order_id,
        "total": total,
        "whatsapp_link": wa_link
    })


# ============================================
# ADMIN — LOGIN
# ============================================

@app.route("/api/admin/login", methods=["POST"])
def admin_login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = (data.get("password") or "").strip()

    if username != config.ADMIN_USERNAME or password != config.ADMIN_PASSWORD:
        return jsonify({"success": False, "error": "Invalid username or password"}), 401

    token = secrets.token_urlsafe(32)
    ACTIVE_TOKENS.add(token)
    return jsonify({"success": True, "token": token})


@app.route("/api/admin/logout", methods=["POST"])
@admin_required
def admin_logout():
    auth = request.headers.get("Authorization", "")
    token = auth.replace("Bearer ", "").strip()
    ACTIVE_TOKENS.discard(token)
    return jsonify({"success": True})


# ============================================
# ADMIN — PRODUCTS
# ============================================

@app.route("/api/admin/products", methods=["GET"])
@admin_required
def admin_get_products():
    """All products, including hidden ones."""
    rows = query(
        "SELECT id, name, description, price, category, subcategory, image_url, is_available "
        "FROM products ORDER BY created_at DESC",
        fetch=True
    )
    for row in rows:
        row["price"] = float(row["price"])
        row["is_available"] = bool(row["is_available"])
    return jsonify({"success": True, "products": rows})


@app.route("/api/admin/products", methods=["POST"])
@admin_required
def admin_create_product():
    data = request.get_json(silent=True) or {}

    required = ["name", "price", "category"]
    for field in required:
        if not data.get(field):
            return jsonify({"success": False, "error": f"Missing field: {field}"}), 400

    new_id = query(
        """INSERT INTO products (name, description, price, category, subcategory, image_url, is_available)
           VALUES (%s, %s, %s, %s, %s, %s, %s)""",
        (
            data["name"],
            data.get("description", ""),
            data["price"],
            data["category"],
            data.get("subcategory", ""),
            data.get("image_url", ""),
            data.get("is_available", True)
        )
    )
    return jsonify({"success": True, "id": new_id})


@app.route("/api/admin/products/<int:product_id>", methods=["PUT"])
@admin_required
def admin_update_product(product_id):
    data = request.get_json(silent=True) or {}

    # Only update fields that were sent
    fields = []
    params = []
    for col in ["name", "description", "price", "category", "subcategory", "image_url", "is_available"]:
        if col in data:
            fields.append(f"{col} = %s")
            params.append(data[col])

    if not fields:
        return jsonify({"success": False, "error": "Nothing to update"}), 400

    params.append(product_id)
    query(f"UPDATE products SET {', '.join(fields)} WHERE id = %s", tuple(params))
    return jsonify({"success": True})


@app.route("/api/admin/products/<int:product_id>", methods=["DELETE"])
@admin_required
def admin_delete_product(product_id):
    query("DELETE FROM products WHERE id = %s", (product_id,))
    return jsonify({"success": True})


# ============================================
# ADMIN — ORDERS
# ============================================

@app.route("/api/admin/orders", methods=["GET"])
@admin_required
def admin_get_orders():
    orders = query(
        """SELECT id, customer_name, customer_phone, location, notes, total_price, status, created_at
           FROM orders ORDER BY created_at DESC""",
        fetch=True
    )
    for o in orders:
        o["total_price"] = float(o["total_price"])
        o["created_at"] = o["created_at"].isoformat()
        items = query(
            "SELECT product_name, price, quantity FROM order_items WHERE order_id = %s",
            (o["id"],),
            fetch=True
        )
        for i in items:
            i["price"] = float(i["price"])
        o["items"] = items
    return jsonify({"success": True, "orders": orders})


@app.route("/api/admin/orders/<int:order_id>/status", methods=["PUT"])
@admin_required
def admin_update_order_status(order_id):
    data = request.get_json(silent=True) or {}
    status = data.get("status")
    if status not in ("new", "contacted", "completed", "cancelled"):
        return jsonify({"success": False, "error": "Invalid status"}), 400
    query("UPDATE orders SET status = %s WHERE id = %s", (status, order_id))
    return jsonify({"success": True})


# ============================================
# ADMIN — IMAGE UPLOAD
# ============================================

def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


@app.route("/api/admin/upload", methods=["POST"])
@admin_required
def admin_upload():
    if "file" not in request.files:
        return jsonify({"success": False, "error": "No file provided"}), 400

    file = request.files["file"]
    if not file.filename:
        return jsonify({"success": False, "error": "Empty filename"}), 400

    if not allowed_file(file.filename):
        return jsonify({"success": False, "error": "File type not allowed"}), 400

    ext = file.filename.rsplit(".", 1)[1].lower()
    filename = f"{secrets.token_hex(8)}.{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    file.save(filepath)

    return jsonify({"success": True, "url": f"/uploads/{filename}"})


@app.route("/uploads/<path:filename>")
def serve_upload(filename):
    return send_from_directory(UPLOAD_DIR, filename)


# ============================================
# STATIC FRONTEND SERVING (dev only)
# ============================================

@app.route("/")
def index():
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.route("/admin")
def admin_page():
    return send_from_directory(FRONTEND_DIR, "admin.html")


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)