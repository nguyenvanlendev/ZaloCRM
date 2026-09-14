import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../backend/src/shared/database/prisma-client.js';

interface CheckpointData {
  completedFiles: string[];
  totalUploadedBytes: number;
  updatedMessagesCount: number;
  lastRunAt: string;
}

const CHECKPOINT_PATH = '/Volumes/Win/media_sync_checkpoint.json';
const TOTAL_ARCHIVE_SIZE_BYTES = 83 * 1024 * 1024 * 1024; // 83 GB
const ESTIMATED_TOTAL_FILES = 93000;

async function checkProgress() {
  console.log('================================================================================');
  console.log('📊 TIẾN ĐỘ ĐỒNG BỘ MEDIA LÊN CLOUD S3 (ZALOCRM)');
  console.log('================================================================================');

  if (!fs.existsSync(CHECKPOINT_PATH)) {
    console.log('⚠️ Chưa tìm thấy file checkpoint tại: ' + CHECKPOINT_PATH);
    process.exit(0);
  }

  const raw = fs.readFileSync(CHECKPOINT_PATH, 'utf8');
  const cp: CheckpointData = JSON.parse(raw);

  const completedCount = cp.completedFiles.length;
  const uploadedMB = cp.totalUploadedBytes / (1024 * 1024);
  const uploadedGB = uploadedMB / 1024;

  const fileProgressPercent = Math.min(100, (completedCount / ESTIMATED_TOTAL_FILES) * 100);
  const byteProgressPercent = Math.min(100, (cp.totalUploadedBytes / TOTAL_ARCHIVE_SIZE_BYTES) * 100);

  // Thống kê thực tế từ DB
  let s3MsgsCount = 0;
  try {
    s3MsgsCount = await prisma.message.count({
      where: {
        conversation: { zaloAccountId: '344c3847-178d-443d-8fd7-2629240bfe78' },
        content: { contains: 's3south.storage.com.vn' },
      },
    });
  } catch {}

  // Tính thời gian & tốc độ
  const stat = fs.statSync(CHECKPOINT_PATH);
  const now = Date.now();
  const lastUpdateSecAgo = Math.floor((now - new Date(cp.lastRunAt).getTime()) / 1000);

  console.log(`• Tình trạng tiến trình : ${lastUpdateSecAgo < 30 ? '🟢 ĐANG CHẠY RẤT TÍCH CỰC' : '🟡 Cập nhật cách đây ' + lastUpdateSecAgo + ' giây'}`);
  console.log(`• Số file đã tải lên    : ${completedCount.toLocaleString()} / ~${ESTIMATED_TOTAL_FILES.toLocaleString()} files (${fileProgressPercent.toFixed(1)}%)`);
  console.log(`• Dung lượng đã nạp     : ${uploadedMB.toFixed(1)} MB (${uploadedGB.toFixed(2)} GB)`);
  console.log(`• Tin nhắn DB đã gắn S3 : ${s3MsgsCount.toLocaleString()} tin nhắn`);
  console.log(`• Lần lưu checkpoint gần: ${new Date(cp.lastRunAt).toLocaleTimeString('vi-VN')} (${new Date(cp.lastRunAt).toLocaleDateString('vi-VN')})`);

  // Thanh tiến trình trực quan
  const barLen = 30;
  const filled = Math.round((fileProgressPercent / 100) * barLen);
  const bar = '█'.repeat(filled) + '░'.repeat(barLen - filled);
  console.log(`\nTiến độ file: [${bar}] ${fileProgressPercent.toFixed(1)}%`);

  console.log('================================================================================');
}

checkProgress()
  .catch(console.error)
  .finally(() => process.exit(0));
