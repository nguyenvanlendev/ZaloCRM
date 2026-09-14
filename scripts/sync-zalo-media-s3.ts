import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
// @ts-ignore
import tar from '../backend/node_modules/tar-stream/index.js';
// @ts-ignore
import mime from '../backend/node_modules/mime-types/index.js';
// @ts-ignore
import { S3Client, PutObjectCommand } from '../backend/node_modules/@aws-sdk/client-s3/dist-cjs/index.js';
import { prisma } from '../backend/src/shared/database/prisma-client.js';

const execFileAsync = promisify(execFile);

interface SyncOptions {
  backupPath: string;
  uin: string;
  accountId: string;
  limit?: number;
  dryRun?: boolean;
  checkpointPath: string;
}

interface CheckpointData {
  completedFiles: string[];
  totalUploadedBytes: number;
  updatedMessagesCount: number;
  lastRunAt: string;
}

// Cấu hình S3
const S3_BUCKET = process.env.S3_BUCKET || 'yootvn';
const S3_PREFIX = process.env.S3_PREFIX ? `${process.env.S3_PREFIX}/media/zalo-backup` : 'YOEDU/zalocrm-yoedu/media/zalo-backup';
const S3_PUBLIC_BASE = 'https://s3south.storage.com.vn/' + S3_BUCKET + '/' + S3_PREFIX;

const s3 = new S3Client({
  region: process.env.S3_REGION || 'us-east-1',
  endpoint: process.env.S3_ENDPOINT || 'https://s3south.storage.com.vn',
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY || '89569b5b209f730aSZ32',
    secretAccessKey: process.env.S3_SECRET_KEY || 'ORiTAxZn9scbYbIHmtTTfVMbfC368JX7dnFuwmyn',
  },
});

/**
 * Chuyển đổi JPEG-XL (.jxl) sang standard JPEG (.jpg) bằng /usr/bin/sips (Apple ImageIO)
 */
async function convertJxlToJpeg(inputBuf: Buffer, tempId: string): Promise<Buffer> {
  const tmpDir = '/tmp';
  const inPath = path.join(tmpDir, `zalo_${tempId}.jxl`);
  const outPath = path.join(tmpDir, `zalo_${tempId}.jpg`);

  try {
    await fs.promises.writeFile(inPath, inputBuf);
    await execFileAsync('/usr/bin/sips', ['-s', 'format', 'jpeg', inPath, '--out', outPath]);
    const outBuf = await fs.promises.readFile(outPath);
    return outBuf;
  } finally {
    try { await fs.promises.unlink(inPath); } catch {}
    try { await fs.promises.unlink(outPath); } catch {}
  }
}

async function uploadToS3WithRetry(cmd: any, fileSizeBytes = 100000, retries = 3) {
  // Timeout tự thích ứng theo dung lượng file: tối thiểu 45s, tính thêm 1s cho mỗi 40KB
  const timeoutMs = Math.max(45000, Math.ceil(fileSizeBytes / 40000) * 1000);
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await s3.send(cmd, { abortSignal: AbortSignal.timeout(timeoutMs) });
      return;
    } catch (err: any) {
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, attempt * 1000));
    }
  }
}

async function updateMessageWithRetry(matchedMsgId: string, data: any, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await prisma.message.update({
        where: { id: matchedMsgId },
        data,
      });
      return;
    } catch (err: any) {
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, attempt * 1000));
    }
  }
}

export async function syncZaloMediaToS3(options: SyncOptions) {
  const {
    backupPath,
    uin,
    accountId,
    limit = Infinity,
    dryRun = false,
    checkpointPath,
  } = options;

  console.log('================================================================================');
  console.log('🚀 BẮT ĐẦU ĐỒNG BỘ MEDIA TỪ ZALO PC BACKUP LÊN CLOUD S3');
  console.log('================================================================================');
  console.log(`• File archive  : ${backupPath}`);
  console.log(`• S3 Target     : ${S3_PUBLIC_BASE}`);
  console.log(`• Giới hạn nạp  : ${limit === Infinity ? 'TOÀN BỘ' : limit + ' files'}`);
  console.log(`• Chế độ Dry-run: ${dryRun ? 'BẬT (không upload / không sửa DB)' : 'TẮT (upload thật)'}`);
  console.log(`• Checkpoint    : ${checkpointPath}`);

  // 1. Tải Checkpoint cũ (nếu có)
  let checkpoint: CheckpointData = {
    completedFiles: [],
    totalUploadedBytes: 0,
    updatedMessagesCount: 0,
    lastRunAt: new Date().toISOString(),
  };

  if (fs.existsSync(checkpointPath)) {
    try {
      const raw = fs.readFileSync(checkpointPath, 'utf8');
      checkpoint = JSON.parse(raw);
      console.log(`✅ Đã nạp checkpoint: Đã hoàn thành ${checkpoint.completedFiles.length.toLocaleString()} files (${(checkpoint.totalUploadedBytes / 1024 / 1024).toFixed(1)} MB) trước đó.`);
    } catch (e) {
      console.warn('⚠️ Lỗi đọc checkpoint cũ, khởi tạo lại mới.');
    }
  }

  const completedSet = new Set<string>(checkpoint.completedFiles);

  const saveCheckpoint = () => {
    try {
      checkpoint.completedFiles = Array.from(completedSet);
      checkpoint.lastRunAt = new Date().toISOString();
      fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2), 'utf8');
    } catch {}
  };

  // 2. Nạp message.zdb vào RAM để lập bản đồ tuyệt đối hash/localPath -> zaloMsgId
  console.log('\n[1/3] Nạp bản đồ định danh từ message.zdb (Zalo PC SQLite/JSON stream)...');
  const zdbCandidates = [
    path.join(path.dirname(backupPath), 'zdb_extracted', 'message.zdb'),
    '/Volumes/Win/zdb_extracted/message.zdb',
    path.join(path.dirname(backupPath), 'message.zdb'),
  ];
  const zdbPath = zdbCandidates.find((p) => fs.existsSync(p));

  const hashToMsgId = new Map<string, string>();        // 32-char hex hash -> zaloMsgId
  const fileKeyToMsgId = new Map<string, string>();     // basename -> zaloMsgId
  const msgOriginalName = new Map<string, string>();    // zaloMsgId -> original filename (for docs/files)

  if (zdbPath) {
    const tZdb = Date.now();
    const rl = (await import('node:readline')).createInterface({
      input: fs.createReadStream(zdbPath),
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (!line.includes('"localPath":')) continue;
      try {
        const m = JSON.parse(line);
        const msgId = String(m.msgId || '');
        const localPath = String(m.localPath || '');
        if (!msgId || !localPath) continue;

        const base = path.basename(localPath).toLowerCase();
        fileKeyToMsgId.set(base, msgId);

        // Extract 32-char hex hash if present (e.g. z6149323993486_264dd9009b4721fd6da3b2a3281a2fc3.jpg)
        const hMatch = localPath.match(/([0-9a-fA-F]{32})/);
        if (hMatch) {
          hashToMsgId.set(hMatch[1].toLowerCase(), msgId);
        }

        // Store original title/filename for files
        if (m.message && typeof m.message === 'object') {
          const title = m.message.title || m.message.name;
          if (title) msgOriginalName.set(msgId, String(title));
        }
      } catch {}
    }
    console.log(`✅ Đã nạp message.zdb trong ${((Date.now() - tZdb) / 1000).toFixed(2)}s: ${hashToMsgId.size.toLocaleString()} mã hash, ${fileKeyToMsgId.size.toLocaleString()} file keys`);
  } else {
    console.log('ℹ️ Không tìm thấy message.zdb rời, sử dụng fallback chỉ mục DB.');
  }

  // 3. Nạp bộ chỉ mục Messages từ Prod DB vào RAM
  console.log('\n[2/3] Đang nạp danh mục tin nhắn media từ Prod DB vào RAM...');
  const t0 = Date.now();
  const mediaMsgs = await prisma.message.findMany({
    where: {
      conversation: { zaloAccountId: accountId },
      contentType: { in: ['image', 'file', 'video', 'voice', 'gif'] },
    },
    select: {
      id: true,
      zaloMsgId: true,
      sentAt: true,
      content: true,
      contentType: true,
      conversation: { select: { externalThreadId: true } },
    },
  });

  console.log(`✅ Đã nạp ${mediaMsgs.length.toLocaleString()} tin nhắn media trong ${Date.now() - t0}ms`);

  const msgById = new Map<string, typeof mediaMsgs[0]>();
  const msgByZaloId = new Map<string, typeof mediaMsgs[0]>();
  const hashMap = new Map<string, string>();       // hash -> messageId
  const timeMap = new Map<string, string[]>();     // `${threadId}:${Math.floor(sentAtMs/3000)}` -> messageIds

  for (const m of mediaMsgs) {
    msgById.set(m.id, m);
    if (m.zaloMsgId) {
      msgByZaloId.set(m.zaloMsgId, m);
    }
    const threadId = (m.conversation?.externalThreadId || '').replace(/^g/, '');
    const sentBucket = Math.floor(m.sentAt.getTime() / 3000);
    const timeKey = `${threadId}:${sentBucket}`;
    const existing = timeMap.get(timeKey) || [];
    existing.push(m.id);
    timeMap.set(timeKey, existing);

    if (m.content) {
      const matches = m.content.match(/[0-9a-fA-F]{32}|[0-9a-zA-Z_-]{20,}/g);
      if (matches) {
        for (const h of matches) {
          hashMap.set(h.toLowerCase(), m.id);
        }
      }
    }
  }

  console.log(`✅ Chỉ mục bộ nhớ: ${msgByZaloId.size.toLocaleString()} ZaloMsgId, ${hashMap.size.toLocaleString()} mã hash DB`);

  // 4. Khởi tạo luồng giải mã AES-256-CBC và tar-stream
  console.log('\n[3/3] Bắt đầu stream đọc và upload media lên S3...');
  const key = crypto.createHash('sha256').update(uin).digest();
  const iv = Buffer.from('zie' + uin.slice(0, 13));

  const readStream = fs.createReadStream(backupPath);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  const extract = tar.extract();

  // Theo dõi phiên bản HD đã upload để không bị thumbnail ghi đè
  const uploadedHdHashes = new Set<string>();

  let processedCount = 0;
  let successCount = 0;
  let matchCount = 0;
  let skippedCount = 0;
  let currentBytes = checkpoint.totalUploadedBytes;

  await new Promise<void>((resolve, reject) => {
    extract.on('entry', async (header: any, stream: any, next: () => void) => {
      // Bỏ qua thư mục, database và file cache nội bộ
      if (
        header.type !== 'file' ||
        header.name.endsWith('.zdb') ||
        header.name.endsWith('.rescache') ||
        header.size === 0
      ) {
        stream.on('end', next);
        stream.resume();
        return;
      }

      // Kiểm tra checkpoint
      if (completedSet.has(header.name)) {
        skippedCount++;
        stream.on('end', next);
        stream.resume();
        return;
      }

      // Giới hạn số lượng (nếu có đặt --limit)
      if (processedCount >= limit) {
        readStream.destroy();
        resolve();
        return;
      }

      processedCount++;

      // Đọc toàn bộ buffer của file
      const chunks: Buffer[] = [];
      stream.on('data', (c: Buffer) => chunks.push(c));
      stream.on('end', async () => {
        try {
          let fileBuf = Buffer.concat(chunks);
          let filename = path.basename(header.name);
          let ext = path.extname(filename).toLowerCase();
          let mimeType = mime.lookup(filename) || 'application/octet-stream';

          // Tách threadId từ đường dẫn: e.g. .../resource/{threadId}/picture/...
          const parts = header.name.split('/');
          let threadId = '';
          const resIdx = parts.indexOf('resource');
          if (resIdx !== -1 && parts[resIdx + 1]) {
            threadId = parts[resIdx + 1].replace(/^g/, '');
          }

          // Trích xuất mã hash 32-char hex nếu có
          const hashMatch = filename.match(/([0-9a-fA-F]{32})/);
          const fileHash = hashMatch ? hashMatch[1].toLowerCase() : null;

          // Xử lý chuyển đổi nếu là JPEG-XL (.jxl)
          let isConvertedJxl = false;
          if (ext === '.jxl') {
            try {
              const randId = crypto.randomBytes(6).toString('hex');
              fileBuf = await convertJxlToJpeg(fileBuf, randId);
              filename = filename.replace(/\.jxl$/i, '.jpg');
              ext = '.jpg';
              mimeType = 'image/jpeg';
              isConvertedJxl = true;
              if (fileHash) uploadedHdHashes.add(fileHash);
            } catch (convErr: any) {
              console.warn(`⚠️ Lỗi convert JXL cho ${filename}: ${convErr.message}. Tiếp tục upload file gốc.`);
            }
          } else if (ext === '.jpg' && fileHash && uploadedHdHashes.has(fileHash)) {
            // Đã có bản HD chất lượng cao được nạp từ .jxl, bỏ qua việc ghi đè bởi thumbnail nhỏ
            completedSet.add(header.name);
            next();
            return;
          }

          // Khóa S3 Key an toàn UTF-8
          const s3RelativeKey = `${threadId || 'general'}/${filename}`;
          const s3FullKey = `${S3_PREFIX}/${s3RelativeKey}`;
          const publicUrl = `${S3_PUBLIC_BASE}/${encodeURI(s3RelativeKey)}`;

          // Upload lên S3 (nếu không dry-run)
          if (!dryRun) {
            await uploadToS3WithRetry(
              new PutObjectCommand({
                Bucket: S3_BUCKET,
                Key: s3FullKey,
                Body: fileBuf,
                ContentType: mimeType,
                ContentLength: fileBuf.length,
                CacheControl: 'public, max-age=31536000, immutable',
                ACL: 'public-read',
              }),
              fileBuf.length,
            );
          }

          currentBytes += fileBuf.length;
          successCount++;
          completedSet.add(header.name);

          // TÌM TIN NHẮN TƯƠNG ỨNG TRONG DB (4 cấp bậc ghép nối tuyệt đối)
          let matchedMsg: typeof mediaMsgs[0] | undefined;

          // Cấp 1: Tra cứu hash qua message.zdb -> zaloMsgId -> DB Message
          if (fileHash && hashToMsgId.has(fileHash)) {
            const zMsgId = hashToMsgId.get(fileHash)!;
            matchedMsg = msgByZaloId.get(zMsgId);
          }

          // Cấp 2: Tra cứu filename qua message.zdb -> zaloMsgId -> DB Message
          if (!matchedMsg) {
            const lowerBase = filename.toLowerCase();
            const zMsgId = fileKeyToMsgId.get(lowerBase);
            if (zMsgId) {
              matchedMsg = msgByZaloId.get(zMsgId);
            }
          }

          // Cấp 3: Tra cứu hash trực tiếp từ DB content
          if (!matchedMsg && fileHash && hashMap.has(fileHash)) {
            const mId = hashMap.get(fileHash)!;
            matchedMsg = msgById.get(mId);
          }

          // Cấp 4: Tra cứu theo khoảng thời gian gần đúng (±3s)
          if (!matchedMsg && threadId) {
            const timePrefix = filename.match(/^(\d+)_/);
            if (timePrefix) {
              const fileTs = parseInt(timePrefix[1], 10);
              const bucket = Math.floor(fileTs / 3000);
              for (const b of [bucket, bucket - 1, bucket + 1]) {
                const candidateIds = timeMap.get(`${threadId}:${b}`);
                if (candidateIds && candidateIds.length > 0) {
                  matchedMsg = msgById.get(candidateIds[0]);
                  break;
                }
              }
            }
          }

          if (matchedMsg) {
            matchCount++;
            if (!dryRun) {
              // Lấy tên gốc của file nếu có
              const origName = (matchedMsg.zaloMsgId && msgOriginalName.get(matchedMsg.zaloMsgId)) || filename;

              // Chuẩn hóa content JSON tương thích 100% với message-bubble.vue & MessageThread.vue
              let updatedContent = matchedMsg.content;
              let contentObj: any = {};

              if (updatedContent && updatedContent.startsWith('{')) {
                try {
                  contentObj = JSON.parse(updatedContent);
                } catch {
                  contentObj = {};
                }
              }

              // Cập nhật tất cả các trường URL ảnh/media
              contentObj.href = publicUrl;
              contentObj.normalUrl = publicUrl;
              contentObj.hdUrl = publicUrl;
              contentObj.thumbUrl = publicUrl;
              contentObj.thumb = publicUrl;
              contentObj.oriUrl = publicUrl;
              contentObj.fileUrl = publicUrl;

              if (matchedMsg.contentType === 'file') {
                contentObj.name = contentObj.name || contentObj.title || origName;
                contentObj.size = fileBuf.length;
              }

              updatedContent = JSON.stringify(contentObj);

              // Cập nhật cột attachments chuẩn cho FollowUpHistoryDialog & Backend APIs
              const newAttachment = {
                url: publicUrl,
                name: origName,
                size: fileBuf.length,
                mime: mimeType,
              };

              await updateMessageWithRetry(matchedMsg.id, {
                content: updatedContent,
                attachments: [newAttachment],
              });
            }
          }

          if (successCount % 10 === 0 || processedCount <= 10) {
            console.log(
              `[${processedCount.toString().padStart(4)}] ` +
              `Upload: ${filename} (${(fileBuf.length / 1024).toFixed(0)} KB${isConvertedJxl ? ', JXL->JPG' : ''}) ` +
              `| Match DB: ${matchedMsg ? '✅ ' + matchedMsg.id.slice(0, 8) + ' (' + matchedMsg.contentType + ')' : '⏳ Không khớp'} ` +
              `| Đã nạp: ${(currentBytes / 1024 / 1024).toFixed(1)} MB`
            );
          }

          if (successCount % 50 === 0) {
            checkpoint.totalUploadedBytes = currentBytes;
            checkpoint.updatedMessagesCount += matchCount;
            saveCheckpoint();
          }

          next();
        } catch (err: any) {
          console.error(`❌ Lỗi xử lý entry ${header.name}:`, err.message);
          next();
        }
      });
    });

    readStream.pipe(decipher).pipe(extract);
    extract.on('finish', () => resolve());
    extract.on('error', reject);
    readStream.on('error', reject);
    decipher.on('error', reject);
  });

  // Lưu checkpoint lần cuối
  checkpoint.totalUploadedBytes = currentBytes;
  checkpoint.updatedMessagesCount += matchCount;
  saveCheckpoint();

  console.log('\n================================================================================');
  console.log('🎉 TỔNG KẾT TIẾN TRÌNH ĐỒNG BỘ MEDIA:');
  console.log(`• Số file đã xử lý trong lượt này: ${successCount.toLocaleString()} files`);
  console.log(`• Số file đã khớp và cập nhật DB : ${matchCount.toLocaleString()} tin nhắn`);
  console.log(`• Số file đã bỏ qua (từ trước)   : ${skippedCount.toLocaleString()} files`);
  console.log(`• Tổng dung lượng đã nạp lên S3  : ${(currentBytes / 1024 / 1024).toFixed(1)} MB`);
  console.log('================================================================================');
}

// CLI Runner
async function runCli() {
  const args = process.argv.slice(2);
  const backupPath = args[0] || '/Volumes/Win/backup_zalo_14_09_2026.zl.zip';

  let uin = '192248ad690c4f0139edbaa821261c9c';
  const uinIdx = args.indexOf('--uin');
  if (uinIdx !== -1) uin = args[uinIdx + 1];

  let accountId = '344c3847-178d-443d-8fd7-2629240bfe78';
  const accIdx = args.indexOf('--account');
  if (accIdx !== -1) accountId = args[accIdx + 1];

  let limit = Infinity;
  const limitIdx = args.indexOf('--limit');
  if (limitIdx !== -1) limit = parseInt(args[limitIdx + 1], 10);

  const dryRun = args.includes('--dry-run');

  let checkpointPath = '/Volumes/Win/media_sync_checkpoint.json';
  const cpIdx = args.indexOf('--checkpoint');
  if (cpIdx !== -1) checkpointPath = args[cpIdx + 1];

  await syncZaloMediaToS3({
    backupPath,
    uin,
    accountId,
    limit,
    dryRun,
    checkpointPath,
  });

  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
