# MyStore BW

E-commerce catalog site for a store in Botswana. Currency: BWP (Pula).
Products are displayed only — no on-site payment. Orders are placed via a
form, saved to the database, then the customer is redirected to WhatsApp
with a pre-filled message.

## Stack

- **Frontend:** HTML / CSS / vanilla JS — hosted on GitHub Pages
- **Backend:** Python / Flask — hosted on Render
- **Database:** MySQL — hosted on Aiven
- **Images:** Cloudinary

## Structure

    backend/    Flask API (app.py, config.py, database.py, .env.example)
    frontend/   Static site (index.html, admin.html, css/, js/)

## Local development

    cd backend
    venv\Scripts\activate.bat
    python app.py

Then open http://127.0.0.1:5000/ (admin at /admin).

Copy `.env.example` to `.env` and fill in your own credentials first.