import crypto from 'crypto';
import dotenv from 'dotenv';
import express, { NextFunction, Request, Response } from 'express';
import { getApps, initializeApp as initializeAdminApp } from 'firebase-admin/app';
import { DecodedIdToken, getAuth as getAdminAuth } from 'firebase-admin/auth';
import { initializeApp as initializeClientApp } from 'firebase/app';
import { collection, doc, getDoc, getDocs, getFirestore } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import firebaseConfig from './firebase-applet-config.json' with { type: 'json' };
import {
  DEFAULT_ADDONS,
  DEFAULT_COUPONS,
  DEFAULT_PRODUCTS,
  DEFAULT_STORE_SETTINGS,
} from './src/lib/defaultCatalog.ts';
import type { Addon, Coupon, Product, StoreSettings } from './src/types/domain.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';
const UPLOAD_DIR = path.resolve(__dirname, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// In-memory fallback secret when ORDER_SIGNING_SECRET env var is unset
const ORDER_SIGNING_SECRET =
  process.env.ORDER_SIGNING_SECRET || crypto.randomBytes(32).toString('hex');

const BOOTSTRAP_ADMIN_EMAILS = ['maiconsillva2025@gmail.com', 'inovaprotech@gmail.com'];

// Firebase Admin SDK (used strictly for verifyIdToken, no IAM needed)
if (!getApps().length) {
  initializeAdminApp({
    projectId: firebaseConfig.projectId,
  });
}
const adminAuth = getAdminAuth();

// Firebase Client SDK in Node for reading public catalog & settings for authoritative server calculations
const serverFirebaseApp = initializeClientApp(firebaseConfig, 'server-catalog-reader');
const serverDb = getFirestore(serverFirebaseApp, firebaseConfig.firestoreDatabaseId);

interface AuthedRequest extends Request {
  adminUser?: DecodedIdToken;
}

async function requireAdminAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token de autenticação ausente.' });
    return;
  }
  const token = authHeader.slice(7).trim();
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const allowedExtra = (process.env.ADMIN_EMAILS || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const email = (decoded.email || '').toLowerCase();
    const isPasswordAdmin =
      email === 'inovaprotech@gmail.com' && decoded.firebase?.sign_in_provider === 'password';
    const isAllowedEmail =
      BOOTSTRAP_ADMIN_EMAILS.includes(email) || allowedExtra.includes(email);
    if ((!decoded.email_verified && !isPasswordAdmin) || !isAllowedEmail) {
      res.status(403).json({ error: 'Acesso restrito ao administrador autorizado.' });
      return;
    }
    req.adminUser = decoded;
    next();
  } catch (error) {
    console.error('Erro ao verificar token admin:', error);
    res.status(401).json({ error: 'Sessão administrativa inválida ou expirada.' });
  }
}

async function loadAuthoritativeCatalog(): Promise<{
  settings: StoreSettings;
  productsMap: Map<string, Product>;
  addonsMap: Map<string, Addon>;
}> {
  const settingsSnap = await getDoc(doc(serverDb, 'storeSettings', 'main'));
  const settings: StoreSettings = settingsSnap.exists()
    ? (settingsSnap.data() as StoreSettings)
    : DEFAULT_STORE_SETTINGS;

  const productsSnap = await getDocs(collection(serverDb, 'products'));
  const productsMap = new Map<string, Product>();
  if (!productsSnap.empty) {
    productsSnap.forEach((d) => {
      productsMap.set(d.id, { ...(d.data() as Product), id: d.id });
    });
  } else {
    DEFAULT_PRODUCTS.forEach((p) => productsMap.set(p.id, p));
  }

  const addonsSnap = await getDocs(collection(serverDb, 'addons'));
  const addonsMap = new Map<string, Addon>();
  if (!addonsSnap.empty) {
    addonsSnap.forEach((d) => {
      addonsMap.set(d.id, { ...(d.data() as Addon), id: d.id });
    });
  } else {
    DEFAULT_ADDONS.forEach((a) => addonsMap.set(a.id, a));
  }

  return { settings, productsMap, addonsMap };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '6mb' }));

  // Serve persistent uploaded images safely
  app.use('/uploads', express.static(UPLOAD_DIR));

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'dois-amores-platform' });
  });

  // Optional demo credentials hint for /admin login screen (only active when DEMO_ADMIN_PASSWORD is set)
  app.get('/api/admin/demo-hint', (_req, res) => {
    const demoPassword = (process.env.DEMO_ADMIN_PASSWORD || '').trim();
    const demoEmail = (process.env.DEMO_ADMIN_EMAIL || 'inovaprotech@gmail.com').trim();
    if (!demoPassword) {
      res.json({ enabled: false, email: demoEmail });
      return;
    }
    res.json({
      enabled: true,
      email: demoEmail,
      password: demoPassword,
    });
  });

  // Protected image upload endpoint (Admin only)
  app.post('/api/upload', requireAdminAuth, (req: AuthedRequest, res) => {
    try {
      const { mimeType, dataBase64 } = req.body as {
        mimeType?: string;
        dataBase64?: string;
      };

      const extMap: Record<string, string> = {
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/jpg': 'jpg',
        'image/webp': 'webp',
      };

      if (!mimeType || !extMap[mimeType] || typeof dataBase64 !== 'string') {
        res.status(400).json({ error: 'Formato inválido. Envie PNG, JPG ou WEBP.' });
        return;
      }

      const cleanedBase64 = dataBase64.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');
      const buffer = Buffer.from(cleanedBase64, 'base64');
      if (buffer.length === 0 || buffer.length > 4 * 1024 * 1024) {
        res.status(400).json({ error: 'A imagem deve ter até 4 MB.' });
        return;
      }

      const safeFilename = `${Date.now()}_${crypto.randomBytes(8).toString('hex')}.${extMap[mimeType]}`;
      const resolvedPath = path.resolve(UPLOAD_DIR, safeFilename);
      if (!resolvedPath.startsWith(UPLOAD_DIR + path.sep)) {
        res.status(400).json({ error: 'Caminho de arquivo inválido.' });
        return;
      }

      fs.writeFileSync(resolvedPath, buffer);
      res.json({ url: `/uploads/${safeFilename}` });
    } catch (error) {
      console.error('Upload failed:', error);
      res.status(500).json({ error: 'Falha ao salvar a imagem enviada.' });
    }
  });

  // Authoritative server-side order pricing & validation
  app.post('/api/orders/prepare', async (req, res) => {
    try {
      const {
        items,
        couponCode,
        modality,
        neighborhood,
        paymentMethod,
      } = req.body as {
        items?: Array<{
          productId: string;
          sizeId?: string | null;
          baseId?: string | null;
          addons?: Array<{ addonId: string; qty: number }>;
          quantity: number;
          notes?: string;
        }>;
        couponCode?: string;
        modality?: 'delivery' | 'pickup';
        neighborhood?: string;
        paymentMethod?: 'pix' | 'cash' | 'card';
      };

      if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
        res.status(400).json({ error: 'O carrinho deve conter entre 1 e 50 itens.' });
        return;
      }

      if (modality !== 'delivery' && modality !== 'pickup') {
        res.status(400).json({ error: 'Modalidade de entrega inválida.' });
        return;
      }

      if (paymentMethod !== 'pix' && paymentMethod !== 'cash' && paymentMethod !== 'card') {
        res.status(400).json({ error: 'Forma de pagamento inválida.' });
        return;
      }

      const { settings, productsMap, addonsMap } = await loadAuthoritativeCatalog();

      if (!settings.isOpen || settings.pauseOrders) {
        res.status(409).json({
          error: settings.closedMessage || 'A loja está fechada ou pausada para pedidos no momento.',
        });
        return;
      }

      if (modality === 'delivery' && !settings.deliveryEnabled) {
        res.status(400).json({ error: 'Entrega indisponível no momento.' });
        return;
      }
      if (modality === 'pickup' && !settings.pickupEnabled) {
        res.status(400).json({ error: 'Retirada no balcão indisponível no momento.' });
        return;
      }

      if (
        (paymentMethod === 'pix' && !settings.pixEnabled) ||
        (paymentMethod === 'cash' && !settings.cashEnabled) ||
        (paymentMethod === 'card' && !settings.cardEnabled)
      ) {
        res.status(400).json({ error: 'Forma de pagamento selecionada está desativada.' });
        return;
      }

      const verifiedItems: Array<{
        productId: string;
        productName: string;
        sizeName: string;
        baseName: string;
        addons: Array<{ addonId: string; name: string; price: number; qty: number }>;
        quantity: number;
        unitPrice: number;
        lineTotal: number;
        notes: string;
      }> = [];

      let subtotal = 0;

      for (const reqItem of items) {
        const product = productsMap.get(String(reqItem.productId || ''));
        if (!product || product.archived || !product.available) {
          res.status(400).json({ error: 'Um dos produtos selecionados não está mais disponível.' });
          return;
        }

        const qty = Math.floor(Number(reqItem.quantity));
        if (!Number.isFinite(qty) || qty < 1 || qty > 30) {
          res.status(400).json({ error: `Quantidade inválida para ${product.name}.` });
          return;
        }

        const basePrice =
          typeof product.promoPrice === 'number' &&
          product.promoPrice > 0 &&
          product.promoPrice < product.price
            ? product.promoPrice
            : product.price;

        let sizeDelta = 0;
        let sizeName = 'Padrão';
        if (product.sizes && product.sizes.length > 0) {
          const foundSize =
            product.sizes.find((s) => s.id === reqItem.sizeId) || product.sizes[0];
          sizeDelta = Number(foundSize.priceDelta) || 0;
          sizeName = foundSize.name;
        }

        let baseDelta = 0;
        let baseName = 'Tradicional';
        if (product.bases && product.bases.length > 0) {
          const foundBase =
            product.bases.find((b) => b.id === reqItem.baseId) || product.bases[0];
          baseDelta = Number(foundBase.priceDelta) || 0;
          baseName = foundBase.name;
        }

        let addonsUnitTotal = 0;
        const verifiedAddons: Array<{ addonId: string; name: string; price: number; qty: number }> = [];
        if (product.allowAddons && Array.isArray(reqItem.addons)) {
          for (const reqAddon of reqItem.addons) {
            const addon = addonsMap.get(String(reqAddon.addonId || ''));
            if (!addon || !addon.available) {
              res.status(400).json({ error: 'Um dos adicionais selecionados está indisponível.' });
              return;
            }
            const addonQty = Math.floor(Number(reqAddon.qty));
            if (addonQty < 1 || addonQty > addon.maxQty) {
              res.status(400).json({ error: `Quantidade inválida para adicional ${addon.name}.` });
              return;
            }
            addonsUnitTotal += Number(addon.price) * addonQty;
            verifiedAddons.push({
              addonId: addon.id,
              name: addon.name,
              price: Number(addon.price),
              qty: addonQty,
            });
          }
        }

        const unitPrice = Number((basePrice + sizeDelta + baseDelta + addonsUnitTotal).toFixed(2));
        const lineTotal = Number((unitPrice * qty).toFixed(2));
        subtotal = Number((subtotal + lineTotal).toFixed(2));

        verifiedItems.push({
          productId: product.id,
          productName: product.name,
          sizeName,
          baseName,
          addons: verifiedAddons,
          quantity: qty,
          unitPrice,
          lineTotal,
          notes: typeof reqItem.notes === 'string' ? reqItem.notes.slice(0, 200) : '',
        });
      }

      if (subtotal < Number(settings.minOrderValue || 0)) {
        res.status(400).json({
          error: `O pedido mínimo é de R$ ${Number(settings.minOrderValue).toFixed(2).replace('.', ',')}.`,
        });
        return;
      }

      // Calculate delivery fee
      let deliveryFee = 0;
      if (modality === 'delivery') {
        const cleanNeighborhood = (neighborhood || '').trim().toLowerCase();
        const matched = (settings.neighborhoodFees || []).find(
          (n) => n.neighborhood.trim().toLowerCase() === cleanNeighborhood
        );
        deliveryFee = matched ? Number(matched.fee) : Number(settings.deliveryFeeFixed || 0);
      }

      // Validate coupon on server
      let discount = 0;
      let normalizedCoupon = '';
      if (couponCode && typeof couponCode === 'string' && couponCode.trim().length > 0) {
        const cleanCode = couponCode.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
        if (cleanCode.length >= 2) {
          let coupon: Coupon | null = null;
          const couponSnap = await getDoc(doc(serverDb, 'coupons', cleanCode));
          if (couponSnap.exists()) {
            coupon = { ...(couponSnap.data() as Coupon), id: couponSnap.id };
          } else {
            coupon = DEFAULT_COUPONS.find((c) => c.code === cleanCode) || null;
          }

          if (!coupon || !coupon.active) {
            res.status(400).json({ error: 'Cupom inválido ou inativo.' });
            return;
          }
          if (coupon.usedCount >= coupon.maxUses) {
            res.status(400).json({ error: 'Este cupom atingiu o limite de utilizações.' });
            return;
          }
          if (coupon.expiresAt) {
            const exp = new Date(coupon.expiresAt + 'T23:59:59');
            if (!Number.isNaN(exp.getTime()) && exp.getTime() < Date.now()) {
              res.status(400).json({ error: 'Este cupom está expirado.' });
              return;
            }
          }
          if (subtotal < Number(coupon.minOrderValue || 0)) {
            res.status(400).json({
              error: `Cupom válido para pedidos a partir de R$ ${Number(coupon.minOrderValue).toFixed(2).replace('.', ',')}.`,
            });
            return;
          }

          normalizedCoupon = coupon.code;
          discount =
            coupon.type === 'percent'
              ? Number(((subtotal * coupon.value) / 100).toFixed(2))
              : Number(Math.min(subtotal, coupon.value).toFixed(2));
        }
      }

      const total = Number(Math.max(0, subtotal - discount + deliveryFee).toFixed(2));
      const paymentFee = 0; // Fee calculated upon payment confirmation

      const orderId = `ord_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const orderNumber = `DA-${String(Math.floor(1000 + (Date.now() % 9000)))}`;
      const trackingId = `${orderId}_${crypto.randomBytes(12).toString('hex')}`;

      const priceDigest = crypto
        .createHmac('sha256', ORDER_SIGNING_SECRET)
        .update(JSON.stringify({ orderId, subtotal, discount, deliveryFee, total }))
        .digest('hex');

      const itemsSummary = verifiedItems.map((it) => ({
        productId: it.productId,
        productName: it.productName,
        sizeName: it.sizeName,
        quantity: it.quantity,
        lineTotal: it.lineTotal,
      }));

      const productIds = Array.from(new Set(verifiedItems.map((it) => it.productId)));

      res.json({
        orderId,
        orderNumber,
        trackingId,
        couponCode: normalizedCoupon,
        subtotal,
        discount,
        deliveryFee,
        paymentFee,
        total,
        items: verifiedItems,
        itemsSummary,
        productIds,
        estimatedMinutes:
          modality === 'pickup'
            ? Math.max(15, Math.round((settings.estimatedDeliveryMinutes || 30) * 0.6))
            : Number(settings.estimatedDeliveryMinutes || 35),
        priceDigest,
      });
    } catch (error) {
      console.error('Erro ao calcular pedido no servidor:', error);
      res.status(500).json({ error: 'Não foi possível validar os valores do pedido.' });
    }
  });

  // Demo Payment Simulator (verifies order digest and computes fees/transaction ref)
  app.post('/api/payments/simulate', (req, res) => {
    try {
      const {
        orderId,
        paymentMethod,
        subtotal,
        discount,
        deliveryFee,
        total,
        priceDigest,
        outcome,
      } = req.body as {
        orderId?: string;
        paymentMethod?: 'pix' | 'cash' | 'card';
        subtotal?: number;
        discount?: number;
        deliveryFee?: number;
        total?: number;
        priceDigest?: string;
        outcome?: 'approved' | 'declined';
      };

      if (
        typeof orderId !== 'string' ||
        !orderId ||
        (paymentMethod !== 'pix' && paymentMethod !== 'cash' && paymentMethod !== 'card') ||
        typeof total !== 'number' ||
        total < 0
      ) {
        res.status(400).json({ error: 'Dados inválidos para simulação de pagamento.' });
        return;
      }

      if (typeof priceDigest !== 'string' || priceDigest.length < 32) {
        res.status(400).json({ error: 'Assinatura de pedido inválida.' });
        return;
      }

      const expectedDigest = crypto
        .createHmac('sha256', ORDER_SIGNING_SECRET)
        .update(JSON.stringify({ orderId, subtotal, discount, deliveryFee, total }))
        .digest('hex');

      const providedBuf = Buffer.from(priceDigest, 'utf8');
      const expectedBuf = Buffer.from(expectedDigest, 'utf8');
      if (providedBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(providedBuf, expectedBuf)) {
        res.status(403).json({ error: 'Integridade do valor do pedido inválida.' });
        return;
      }

      if (outcome === 'declined') {
        res.status(402).json({
          approved: false,
          error: 'Pagamento recusado no simulador demo. Tente novamente ou escolha outra forma de pagamento.',
        });
        return;
      }

      const feeRate = paymentMethod === 'card' ? 0.032 : paymentMethod === 'pix' ? 0.005 : 0;
      const feeAmount = Number((total * feeRate).toFixed(2));
      const netAmount = Number((total - feeAmount).toFixed(2));
      const txId = `SIM-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      const methodLabel =
        paymentMethod === 'pix' ? 'Pix' : paymentMethod === 'card' ? 'Cartão' : 'Dinheiro';
      const providerRef = `Simulador Demo (${methodLabel}) · ${txId}`;

      res.json({
        approved: true,
        txId,
        feeAmount,
        netAmount,
        providerRef,
      });
    } catch (error) {
      console.error('Erro ao simular pagamento:', error);
      res.status(500).json({ error: 'Falha ao processar simulação de pagamento.' });
    }
  });

  // Real Pix Webhook handler (strictly verifies HMAC signature; never simulates confirmation)
  app.post('/api/webhooks/pix', (req, res) => {
    const secret = process.env.PIX_WEBHOOK_SECRET;
    if (!secret) {
      res.status(501).json({
        error: 'Webhook Pix não configurado. Defina PIX_WEBHOOK_SECRET no ambiente para validar notificações do provedor.',
      });
      return;
    }

    const signature = req.headers['x-pix-signature'];
    const expected = crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(req.body || {}))
      .digest('hex');

    if (typeof signature !== 'string' || signature !== expected) {
      res.status(401).json({ error: 'Assinatura de webhook inválida.' });
      return;
    }

    res.json({ received: true, verified: true });
  });

  if (!IS_PROD) {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, ws: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Dois Amores server running on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
