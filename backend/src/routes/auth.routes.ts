import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export const authRouter = Router();

const ODOO_XMLRPC_URL = process.env.ODOO_URL || 'http://127.0.0.1:10017';
const ODOO_DB = process.env.ODOO_DB_NAME || 'agi';

async function authenticateOdoo(login: string, pass: string): Promise<{ uid: number; name: string } | null> {
  const xml = `<?xml version="1.0"?>
<methodCall>
  <methodName>authenticate</methodName>
  <params>
    <param><value><string>${ODOO_DB}</string></value></param>
    <param><value><string>${login}</string></value></param>
    <param><value><string>${pass}</string></value></param>
    <param><value><struct></struct></value></param>
  </params>
</methodCall>`;

  try {
    const res = await fetch(`${ODOO_XMLRPC_URL}/xmlrpc/2/common`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml' },
      body: xml,
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const text = await res.text();
    const match = text.match(/<int>(\d+)<\/int>/);
    if (!match || match[1] === '0') return null;
    const uid = parseInt(match[1]!, 10);
    if (!uid) return null;

    // Fetch user details
    const readXml = `<?xml version="1.0"?>
<methodCall>
  <methodName>execute_kw</methodName>
  <params>
    <param><value><string>${ODOO_DB}</string></value></param>
    <param><value><int>${uid}</int></value></param>
    <param><value><string>${pass}</string></value></param>
    <param><value><string>res.users</string></value></param>
    <param><value><string>read</string></value></param>
    <param><value><array><data><value><array><data><value><int>${uid}</int></value></data></array></value></data></array></value></param>
    <param><value><struct><member><name>fields</name><value><array><data><value><string>name</string></value><value><string>login</string></value></data></array></value></member></struct></value></param>
  </params>
</methodCall>`;

    const readRes = await fetch(`${ODOO_XMLRPC_URL}/xmlrpc/2/object`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml' },
      body: readXml,
      signal: AbortSignal.timeout(10000),
    });
    const readText = await readRes.text();
    const nameMatch = readText.match(/<name>name<\/name>\s*<value><string>([^<]+)<\/string>/);
    const name = nameMatch ? nameMatch[1]! : login;

    return { uid, name };
  } catch (err) {
    console.error('[odoo-auth] Error:', err);
    return null;
  }
}

authRouter.post('/auth/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username dan password wajib diisi.' });
    }

    const odooUser = await authenticateOdoo(String(username).trim(), String(password));
    if (!odooUser) {
      return res.status(401).json({ error: 'Username atau password Odoo salah.' });
    }

    // Role check: manager/admin or sales
    const role = (odooUser.uid === 2 || ['antonwijaya', 'it', 'harypurwoko'].includes(username.toLowerCase())) ? 'manager' : 'sales';

    const tokenPayload = {
      sub: odooUser.uid,
      username: username.trim(),
      role,
      nama_lengkap: odooUser.name,
    };

    const token = jwt.sign(tokenPayload, env.JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      user: {
        id: odooUser.uid,
        username: username.trim(),
        role,
        nama_lengkap: odooUser.name,
      },
    });
  } catch (err) {
    next(err);
  }
});
