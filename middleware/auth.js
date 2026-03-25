const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'fitbase-progress-secret-change-in-production';
/** Default long-lived sessions for PWA / “stay logged in until logout”. Override with JWT_EXPIRY if needed. */
const JWT_EXPIRY = process.env.JWT_EXPIRY || '365d';

function normalizeUserRole(role) {
  const r = String(role == null ? '' : role).trim().toLowerCase();
  if (r === 'superadmin' || r === 'admin' || r === 'user') return r;
  return 'user';
}

function signToken(payload) {
  const out = { ...payload };
  if (Object.prototype.hasOwnProperty.call(out, 'role')) {
    out.role = normalizeUserRole(out.role);
  }
  return jwt.sign(out, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

function verifyToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : (req.body?.token || req.query?.token);
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user =
      typeof decoded === 'object' && decoded != null
        ? { ...decoded, role: normalizeUserRole(decoded.role) }
        : decoded;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user && normalizeUserRole(req.user.role) === 'admin') return next();
  return res.status(403).json({ error: 'Admin access required' });
}

function requireSuperadmin(req, res, next) {
  if (req.user && normalizeUserRole(req.user.role) === 'superadmin') return next();
  return res.status(403).json({ error: 'Superadmin access required' });
}

function requireAdminOrSuperadmin(req, res, next) {
  const r = req.user ? normalizeUserRole(req.user.role) : '';
  if (r === 'admin' || r === 'superadmin') return next();
  return res.status(403).json({ error: 'Admin or Superadmin access required' });
}

const REPORT_LINK_EXPIRY = process.env.PROGRESS_REPORT_LINK_EXPIRY || '30d';

function signProgressReportToken(userId) {
  return jwt.sign(
    { userId, purpose: 'progress-report' },
    JWT_SECRET,
    { expiresIn: REPORT_LINK_EXPIRY }
  );
}

function verifyProgressReportToken(token) {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded && decoded.purpose === 'progress-report' && decoded.userId) return decoded.userId;
    return null;
  } catch (e) {
    return null;
  }
}

const SHARE_LINK_EXPIRY = process.env.SUPERADMIN_SHARE_LINK_EXPIRY || '24h';

function signShareToken(payload) {
  return jwt.sign(
    { ...payload, purpose: 'superadmin-share' },
    JWT_SECRET,
    { expiresIn: SHARE_LINK_EXPIRY }
  );
}

function verifyShareToken(token) {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded && decoded.purpose === 'superadmin-share') return decoded;
    return null;
  } catch (e) {
    return null;
  }
}

function signPdfAccessToken(programId, userId) {
  return jwt.sign(
    { programId, userId, purpose: 'pdf-view' },
    JWT_SECRET,
    { expiresIn: '10m' }
  );
}

function verifyPdfAccessToken(token) {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded && decoded.purpose === 'pdf-view' && decoded.programId && decoded.userId) {
      return { programId: decoded.programId, userId: decoded.userId };
    }
    return null;
  } catch (e) {
    return null;
  }
}

module.exports = {
  signToken,
  verifyToken,
  requireAdmin,
  requireSuperadmin,
  requireAdminOrSuperadmin,
  normalizeUserRole,
  signProgressReportToken,
  verifyProgressReportToken,
  signShareToken,
  verifyShareToken,
  signPdfAccessToken,
  verifyPdfAccessToken,
  JWT_SECRET
};
