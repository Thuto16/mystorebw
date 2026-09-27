# database.py — Creates and returns MySQL connections

import mysql.connector
from config import DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME

def get_connection():
    """
    Opens a new connection to MySQL.
    Returns the connection object.
    """
    return mysql.connector.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME
    )

def query(sql, params=None, fetch=False):
    """
    Small helper so we don't repeat boilerplate.

    - sql:    SQL string, e.g. "SELECT * FROM products WHERE category=%s"
    - params: tuple of values to fill the %s placeholders
    - fetch:  True for SELECT, False for INSERT/UPDATE/DELETE

    Returns:
      - fetch=True:  list of dictionaries (each row as dict)
      - fetch=False: last inserted row id
    """
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(sql, params or ())
        if fetch:
            return cursor.fetchall()
        else:
            conn.commit()
            return cursor.lastrowid
    finally:
        cursor.close()
        conn.close()