// Sinh cặp khóa RSA 2048 cho access token (RS256) và in hai dòng để dán vào .env:
//   JWT_PRIVATE_KEY  chỉ user service dùng để ký (GIỮ BÍ MẬT)
//   JWT_PUBLIC_KEY   mọi service dùng để kiểm tra token (không bí mật)
// Khóa được mã hóa base64 để nằm gọn trên một dòng; service tự nhận cả PEM nhiều dòng lẫn dạng này.
// Chạy: pnpm jwt:keygen   (không ghi file nào; in ra màn hình để bạn tự dán vào .env)
import { generateKeyPairSync } from 'node:crypto';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
const b64 = (pem) => Buffer.from(pem).toString('base64');

console.log(`JWT_PRIVATE_KEY=${b64(privateKey)}`);
console.log(`JWT_PUBLIC_KEY=${b64(publicKey)}`);
console.error('\nDán hai dòng trên vào .env (thay JWT_ACCESS_SECRET cũ). Đổi khóa thì mọi access token đang dùng mất hiệu lực, người dùng đăng nhập lại.');
