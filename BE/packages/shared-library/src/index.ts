// Điểm vào gốc chỉ export phần nhẹ, không phụ thuộc NestJS: utils và contracts.
// Phần cần NestJS/RabbitMQ import theo đường dẫn con để service nào cần mới nạp:
//   '@phucvi/shared-library/api' | '/crud' | '/messaging' | '/seed-data'
export * from './utils';
export * from './contracts';
