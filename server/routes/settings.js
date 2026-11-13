import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import User from '../models/User.js';
import Organization from '../models/Organization.js';
import Document from '../models/Document.js';
import Review from '../models/Review.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { logActivity } from '../services/activityService.js';

const router = Router();
router.use(requireAuth);

const passwordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Too many password attempts. Please wait a few minutes and try again.' }
});

const publicAccount = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  createdAt: user.createdAt
});

const publicOrganization = (organization) => ({
  id: organization.id,
  name: organization.name,
  slug: organization.slug,
  employeeRegistrationEnabled: organization.settings?.employeeRegistrationEnabled !== false,
  createdAt: organization.createdAt
});

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.get('/', async (req, res, next) => {
  try {
    const organizationId = req.user.organizationId;
    const documentFilter = req.user.role === 'admin' ? { organizationId } : { organizationId, ownerId: req.user._id };
    const reviewFilter = req.user.role === 'admin' ? { organizationId } : { organizationId, creatorId: req.user._id };
    const [account, organization, documents, reviews, awaitingDecision, employeeCount] = await Promise.all([
      User.findById(req.user._id).select('name email role createdAt'),
      Organization.findById(organizationId),
      Document.countDocuments(documentFilter),
      Review.countDocuments(reviewFilter),
      Review.countDocuments({ ...reviewFilter, status: 'in_review' }),
      req.user.role === 'admin'
        ? User.countDocuments({ organizationId, role: 'employee', active: true })
        : Promise.resolve(null)
    ]);

    if (!organization) return res.status(404).json({ message: 'Organisation not found.' });

    res.json({
      account: publicAccount(account),
      organization: publicOrganization(organization),
      stats: { documents, reviews, awaitingDecision, employees: employeeCount }
    });
  } catch (error) { next(error); }
});

router.patch('/profile', async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('+passwordHash');
    if (!user) return res.status(404).json({ message: 'Account not found.' });

    const updates = {};
    if (req.body.name !== undefined) {
      const name = String(req.body.name || '').trim();
      if (name.length < 2 || name.length > 80) return res.status(400).json({ message: 'Enter a name between 2 and 80 characters.' });
      updates.name = name;
    }
    if (req.body.email !== undefined) {
      const email = String(req.body.email || '').trim().toLowerCase();
      if (!emailPattern.test(email) || email.length > 254) return res.status(400).json({ message: 'Enter a valid email address.' });
      if (email !== user.email) {
        const currentPassword = String(req.body.currentPassword || '');
        if (!currentPassword) return res.status(400).json({ message: 'Enter your current password to change your email address.' });
        if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
          return res.status(401).json({ message: 'Your current password is incorrect.' });
        }
        if (await User.exists({ _id: { $ne: user._id }, email })) {
          return res.status(409).json({ message: 'An account with this email already exists.' });
        }
        updates.email = email;
      }
    }

    if (!Object.keys(updates).length) return res.json({ account: publicAccount(user), message: 'No account changes to save.' });

    Object.assign(user, updates);
    await user.save();
    await logActivity({
      organizationId: req.user.organizationId,
      actorId: req.user._id,
      action: 'account.profile_updated',
      entityType: 'user',
      entityId: user._id,
      summary: `${user.name} updated their account profile`
    });
    res.json({ account: publicAccount(user), message: 'Account details updated.' });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ message: 'An account with this email already exists.' });
    next(error);
  }
});

router.post('/password', passwordLimiter, async (req, res, next) => {
  try {
    const currentPassword = String(req.body.currentPassword || '');
    const newPassword = String(req.body.newPassword || '');
    if (!currentPassword) return res.status(400).json({ message: 'Enter your current password.' });
    if (newPassword.length < 10 || newPassword.length > 72 || Buffer.byteLength(newPassword, 'utf8') > 72 || !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      return res.status(400).json({ message: 'Use at least 10 characters, including a letter and a number.' });
    }

    const user = await User.findById(req.user._id).select('+passwordHash');
    if (!user) return res.status(404).json({ message: 'Account not found.' });
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      return res.status(401).json({ message: 'Your current password is incorrect.' });
    }
    if (await bcrypt.compare(newPassword, user.passwordHash)) {
      return res.status(400).json({ message: 'Choose a new password that differs from your current password.' });
    }

    user.passwordHash = await bcrypt.hash(newPassword, 12);
    await user.save();
    await logActivity({
      organizationId: req.user.organizationId,
      actorId: req.user._id,
      action: 'account.password_changed',
      entityType: 'user',
      entityId: user._id,
      summary: `${user.name} changed their account password`
    });
    res.json({ message: 'Password updated. Use your new password the next time you sign in.' });
  } catch (error) { next(error); }
});

router.patch('/organization', requireRole('admin'), async (req, res, next) => {
  try {
    const organization = await Organization.findById(req.user.organizationId);
    if (!organization) return res.status(404).json({ message: 'Organisation not found.' });

    let changed = false;
    if (req.body.name !== undefined) {
      const name = String(req.body.name || '').trim();
      if (name.length < 2 || name.length > 120) return res.status(400).json({ message: 'Enter an organisation name between 2 and 120 characters.' });
      organization.name = name;
      changed = true;
    }
    if (req.body.employeeRegistrationEnabled !== undefined) {
      if (typeof req.body.employeeRegistrationEnabled !== 'boolean') return res.status(400).json({ message: 'Employee registration must be on or off.' });
      if (!organization.settings) organization.settings = {};
      organization.settings.employeeRegistrationEnabled = req.body.employeeRegistrationEnabled;
      changed = true;
    }
    if (!changed) return res.json({ organization: publicOrganization(organization), message: 'No organisation changes to save.' });

    await organization.save();
    await logActivity({
      organizationId: req.user.organizationId,
      actorId: req.user._id,
      action: 'organization.settings_updated',
      entityType: 'organization',
      entityId: organization._id,
      summary: `${req.user.name} updated organisation settings`
    });
    res.json({ organization: publicOrganization(organization), message: 'Organisation settings updated.' });
  } catch (error) { next(error); }
});

export default router;
