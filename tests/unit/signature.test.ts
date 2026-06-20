import { createHmac } from 'crypto';
import { verifyMetaSignature, verifyTiktokSignature } from '../../src/webhooks/signature';

const META_SECRET = 'meta-app-secret';
const TIKTOK_SECRET = 'tiktok-webhook-secret';

const body = Buffer.from(JSON.stringify({ object: 'page', entry: [{ id: '1' }] }));

function metaSig(buf: Buffer, secret: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(buf).digest('hex');
}
function tiktokSig(buf: Buffer, secret: string): string {
  return createHmac('sha256', secret).update(buf).digest('hex');
}

describe('verifyMetaSignature', () => {
  it('accepts a valid signature', () => {
    expect(verifyMetaSignature(body, metaSig(body, META_SECRET), META_SECRET)).toBe(true);
  });

  it('rejects a tampered signature', () => {
    const tampered = metaSig(Buffer.from('different'), META_SECRET);
    expect(verifyMetaSignature(body, tampered, META_SECRET)).toBe(false);
  });

  it('rejects a wrong secret', () => {
    expect(verifyMetaSignature(body, metaSig(body, 'other'), META_SECRET)).toBe(false);
  });

  it('rejects a missing signature', () => {
    expect(verifyMetaSignature(body, undefined, META_SECRET)).toBe(false);
  });

  it('rejects a signature without the sha256= prefix', () => {
    const raw = createHmac('sha256', META_SECRET).update(body).digest('hex');
    expect(verifyMetaSignature(body, raw, META_SECRET)).toBe(false);
  });

  it('rejects when the app secret is empty', () => {
    expect(verifyMetaSignature(body, metaSig(body, ''), '')).toBe(false);
  });
});

describe('verifyTiktokSignature', () => {
  it('accepts a valid signature', () => {
    expect(verifyTiktokSignature(body, tiktokSig(body, TIKTOK_SECRET), TIKTOK_SECRET)).toBe(true);
  });

  it('rejects a tampered body', () => {
    const sig = tiktokSig(body, TIKTOK_SECRET);
    const otherBody = Buffer.from(JSON.stringify({ object: 'page', entry: [{ id: '2' }] }));
    expect(verifyTiktokSignature(otherBody, sig, TIKTOK_SECRET)).toBe(false);
  });

  it('rejects a missing signature', () => {
    expect(verifyTiktokSignature(body, undefined, TIKTOK_SECRET)).toBe(false);
  });

  it('rejects a wrong-length signature without throwing (constant-time guard)', () => {
    expect(verifyTiktokSignature(body, 'abc', TIKTOK_SECRET)).toBe(false);
  });

  it('rejects when the secret is empty', () => {
    expect(verifyTiktokSignature(body, tiktokSig(body, ''), '')).toBe(false);
  });
});
