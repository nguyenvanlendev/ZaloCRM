// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * import-zalo-pc-backup.ts
 *
 * Imports chat history from an encrypted Zalo PC backup archive (.zl.zip).
 * - Decrypts the stream on-the-fly using AES-256-CBC with the extracted session UIN.
 * - Extracts `_zconversation.zdb` (NDJSON) to pre-seed/map conversations.
 * - Automatically resolves group names & member counts from live CRM / Zalo connection.
 * - Automatically resolves contact names, avatars & aliases from Zalo PC CDP session (module UiPd).
 * - Correctly routes group messages (toUid.startsWith('g')) to groups instead of sender UIDs.
 * - Streams `_zmessage.zdb` (NDJSON) and batch-inserts messages into PostgreSQL.
 * - Automatically updates `lastMessageAt` for conversations.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import http from 'node:http';
// @ts-ignore
import tar from '../backend/node_modules/tar-stream/index.js';
// @ts-ignore
import jwt from '../backend/node_modules/jsonwebtoken/index.js';
import { prisma } from '../backend/src/shared/database/prisma-client.js';
import { logger } from '../backend/src/shared/utils/logger.js';

interface ImportOptions {
  backupPath: string;
  uin?: string;
  accountId: string;
  maxMessages?: number;
  dryRun?: boolean;
  clean?: boolean;
}

export interface UserProfileInfo {
  id: string;
  dName: string;
  avatar: string;
  zaloName: string;
  alias: string;
}

/**
 * Connects to Zalo PC via Chrome DevTools Protocol to extract the running session's UIN and UID.
 */
export async function fetchUinFromZaloPc(port = 9222): Promise<{ uid: string; uin: string; displayName: string }> {
  // @ts-ignore
  const wsModule = await import('../backend/node_modules/ws/index.js');
  const WebSocket = wsModule.default || wsModule;

  return new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${port}/json`, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => {
        try {
          const targets = JSON.parse(raw);
          const target = targets.find((t: any) => t.title === 'Zalo') || targets[0];
          if (!target) return reject(new Error('No Zalo window target found via CDP'));

          const ws = new WebSocket(target.webSocketDebuggerUrl);
          ws.on('open', () => {
            const code = `(() => {
              const el = document.querySelector("#app-page") || document.querySelector("#app");
              if (!el) return null;
              const k = Object.keys(el).find(k => k.startsWith("__reactInternalInstance") || k.startsWith("__reactFiber"));
              let node = el[k];
              let rootStore = null;
              while (node) {
                const s = node.memoizedProps?.store || node.stateNode?.store || node.context?.store;
                if (s && s.getState && s.getState().conversations) {
                  rootStore = s;
                  break;
                }
                node = node.return;
              }
              const user = rootStore?.getState()?.user;
              return user ? { uid: user.userId, uin: user.UIN, displayName: user.displayName } : null;
            })()`;
            ws.send(
              JSON.stringify({
                id: 1,
                method: 'Runtime.evaluate',
                params: { expression: code, returnByValue: true },
              }),
            );
          });
          ws.on('message', (msg: any) => {
            const data = JSON.parse(msg.toString());
            ws.close();
            const val = data?.result?.result?.value;
            if (val?.uin) {
              resolve(val);
            } else {
              reject(new Error('Failed to retrieve user UIN from Zalo PC memory'));
            }
          });
          ws.on('error', reject);
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
  });
}

/**
 * Resolves user names, avatars, and aliases directly from Zalo PC memory via CDP.
 */
export async function fetchUserProfilesFromZaloPc(
  userIds: string[],
  port = 9222,
): Promise<Map<string, UserProfileInfo>> {
  const result = new Map<string, UserProfileInfo>();
  if (userIds.length === 0) return result;

  try {
    // @ts-ignore
    const wsModule = await import('../backend/node_modules/ws/index.js');
    const WebSocket = wsModule.default || wsModule;

    const list = await new Promise<UserProfileInfo[]>((resolve, reject) => {
      const req = http.get(`http://127.0.0.1:${port}/json`, (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          try {
            const targets = JSON.parse(raw);
            const target = targets.find((t: any) => t.title === 'Zalo');
            if (!target) return resolve([]);

            const ws = new WebSocket(target.webSocketDebuggerUrl);
            ws.on('open', () => {
              const code = `(() => {
                if (!window.__wreq) {
                  const chunkId = 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2);
                  const modId = 'm_' + Date.now() + '_' + Math.random().toString(36).slice(2);
                  window.webpackJsonp.push([[chunkId], {
                    [modId]: function(m, e, r) { window.__wreq = r; }
                  }, [[modId]]]);
                }
                const wreq = window.__wreq;
                const exp = wreq ? (wreq('UiPd')?.default || wreq('UiPd')) : null;
                const ids = ${JSON.stringify(userIds)};
                return ids.map(id => ({
                  id,
                  dName: exp ? (exp.getDName(id) || exp.getZaloName(id) || exp.getPhonebookName?.(id) || '') : '',
                  avatar: exp ? (exp.getAvatar(id) || '') : '',
                  zaloName: exp ? (exp.getZaloName(id) || '') : '',
                  alias: exp?.getAliasName ? (exp.getAliasName(id) || '') : ''
                }));
              })()`;
              ws.send(
                JSON.stringify({
                  id: 1,
                  method: 'Runtime.evaluate',
                  params: { expression: code, returnByValue: true },
                }),
              );
            });
            ws.on('message', (msg: any) => {
              const data = JSON.parse(msg.toString());
              ws.close();
              resolve(data.result?.result?.value || []);
            });
            ws.on('error', () => resolve([]));
          } catch {
            resolve([]);
          }
        });
      });
      req.on('error', () => resolve([]));
    });

    for (const item of list) {
      if (item && item.id) {
        result.set(item.id, item);
      }
    }
  } catch (err) {
    logger.warn('[import-zalo-pc] Could not fetch profiles from CDP:', err);
  }

  return result;
}

/**
 * Fetches group details from running CRM backend.
 */
export async function fetchGroupsFromBackend(
  accountId: string,
  orgId: string,
): Promise<Map<string, { name: string; totalMember: number }>> {
  const map = new Map<string, { name: string; totalMember: number }>();
  
  const owner = (await prisma.user.findFirst({
    where: { orgId, role: 'owner' },
    select: { id: true, email: true, phone: true, jwtTokenVersion: true },
  })) || (await prisma.user.findFirst({
    where: { orgId },
    select: { id: true, email: true, phone: true, jwtTokenVersion: true },
  }));

  if (!owner) return map;

  const secret = process.env.JWT_SECRET || '9287e137aea35638bcb611f513c2e2c1be5c095f4467676abf46f348ac8a54bf';
  const token = jwt.sign(
    {
      id: owner.id,
      email: owner.email || owner.phone || owner.id,
      role: 'owner',
      orgId,
      tv: owner.jwtTokenVersion,
    },
    secret,
    { expiresIn: '1h' },
  );

  try {
    const apiBase = process.env.API_BASE_URL || process.env.BACKEND_URL || 'http://localhost:3081';
    const endpoint = `${apiBase.replace(/\/$/, '')}/api/v1/zalo-accounts/${accountId}/groups`;
    const res = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const data: any = await res.json();
      if (Array.isArray(data.groups)) {
        for (const g of data.groups) {
          if (g.id) {
            const keyWithG = g.id.startsWith('g') ? g.id : `g${g.id}`;
            const keyWithoutG = g.id.startsWith('g') ? g.id.slice(1) : g.id;
            const val = { name: g.name || '', totalMember: g.totalMember || 0 };
            map.set(keyWithG, val);
            map.set(keyWithoutG, val);
          }
        }
      }
    }
  } catch (err: any) {
    logger.warn(`[import-zalo-pc] Failed to fetch groups from backend: ${err.message}`);
  }
  return map;
}

/**
 * Resolves or fast-extracts conversation.zdb and message.zdb from backup.
 * If backupPath is a directory, reuses existing .zdb files.
 * If backupPath is a .zl.zip archive, extracts the two .zdb files in seconds and stops before 80GB media.
 */
export async function resolveZdbFiles(backupPath: string, uin?: string): Promise<{ convPath: string; msgPath: string }> {
  const stat = fs.statSync(backupPath);
  if (stat.isDirectory()) {
    const files = fs.readdirSync(backupPath);
    const convFile = files.find((f) => f.endsWith('conversation.zdb') || f.endsWith('_zconversation.zdb'));
    const msgFile = files.find((f) => f.endsWith('message.zdb') || f.endsWith('_zmessage.zdb'));
    if (convFile && msgFile) {
      return {
        convPath: path.join(backupPath, convFile),
        msgPath: path.join(backupPath, msgFile),
      };
    }
    throw new Error(`Directory ${backupPath} must contain both conversation.zdb and message.zdb`);
  }

  // Check if adjacent zdb_extracted directory exists with extracted files
  const dirName = path.dirname(backupPath);
  const candidateDir = path.join(dirName, 'zdb_extracted');
  if (
    fs.existsSync(path.join(candidateDir, 'conversation.zdb')) &&
    fs.existsSync(path.join(candidateDir, 'message.zdb'))
  ) {
    logger.info(`[import-zalo-pc] Found pre-extracted databases in ${candidateDir}, reusing them directly.`);
    return {
      convPath: path.join(candidateDir, 'conversation.zdb'),
      msgPath: path.join(candidateDir, 'message.zdb'),
    };
  }

  if (!uin) {
    throw new Error('UIN is required to decrypt .zl.zip archive');
  }

  const outDir = candidateDir;
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const convPath = path.join(outDir, 'conversation.zdb');
  const msgPath = path.join(outDir, 'message.zdb');

  logger.info(`[import-zalo-pc] Fast-extracting databases from ${backupPath} to ${outDir}...`);
  const key = crypto.createHash('sha256').update(uin).digest();
  const iv = Buffer.from('zie' + uin.slice(0, 13));

  const readStream = fs.createReadStream(backupPath);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  const extract = tar.extract();

  await new Promise<void>((resolve, reject) => {
    let convDone = false;
    let msgDone = false;

    const checkBothDone = () => {
      if (convDone && msgDone) {
        readStream.destroy();
        resolve();
      }
    };

    extract.on('entry', (header: any, stream: any, next: () => void) => {
      if (header.name.endsWith('_zconversation.zdb')) {
        const out = fs.createWriteStream(convPath);
        stream.pipe(out);
        out.on('finish', () => {
          convDone = true;
          checkBothDone();
          next();
        });
        out.on('error', reject);
        return;
      }
      if (header.name.endsWith('_zmessage.zdb')) {
        const out = fs.createWriteStream(msgPath);
        stream.pipe(out);
        out.on('finish', () => {
          msgDone = true;
          checkBothDone();
          next();
        });
        out.on('error', reject);
        return;
      }
      stream.on('end', next);
      stream.resume();
    });

    readStream.pipe(decipher).pipe(extract);
    extract.on('finish', resolve);
    extract.on('error', reject);
    readStream.on('error', reject);
    decipher.on('error', reject);
  });

  logger.info(`[import-zalo-pc] Fast extraction complete: conv=${convPath}, msg=${msgPath}`);
  return { convPath, msgPath };
}

export async function importZaloPcBackup(options: ImportOptions) {
  const { backupPath, uin, accountId, maxMessages = Infinity, dryRun = false, clean = false } = options;

  logger.info(`[import-zalo-pc] Starting import from ${backupPath} (dryRun=${dryRun}, clean=${clean}, max=${maxMessages === Infinity ? 'ALL' : maxMessages})`);

  const account = await prisma.zaloAccount.findUnique({
    where: { id: accountId },
    select: { id: true, orgId: true, zaloUid: true, displayName: true },
  });

  if (!account) {
    throw new Error(`ZaloAccount with id ${accountId} not found in CRM database`);
  }

  // Resolve databases
  const { convPath, msgPath } = await resolveZdbFiles(backupPath, uin);

  // 1. If clean is requested, delete old conversations and cascading messages
  if (clean && !dryRun) {
    logger.info(`[import-zalo-pc] Cleaning existing conversations & messages for account ${accountId}...`);
    const delRes = await prisma.conversation.deleteMany({
      where: { zaloAccountId: accountId },
    });
    logger.info(`[import-zalo-pc] Cleaned ${delRes.count} existing conversation(s).`);
  }

  // 2. Fetch all groups info from backend
  logger.info(`[import-zalo-pc] Fetching group details from CRM backend...`);
  const groupsInfoMap = await fetchGroupsFromBackend(accountId, account.orgId);
  logger.info(`[import-zalo-pc] Retrieved info for ${groupsInfoMap.size / 2} group(s)`);

  // Cache conversation mappings: externalThreadId -> conversationId
  const conversationMap = new Map<string, string>();
  // Track newest sentAt per conversation
  const convLastMsgMap = new Map<string, Date>();

  // Preload existing conversations from DB if not cleaned
  if (!clean) {
    const existingConvs = await prisma.conversation.findMany({
      where: { zaloAccountId: accountId },
      select: { id: true, externalThreadId: true, lastMessageAt: true },
    });
    for (const c of existingConvs) {
      if (c.externalThreadId) {
        conversationMap.set(c.externalThreadId, c.id);
        if (c.lastMessageAt) convLastMsgMap.set(c.id, c.lastMessageAt);
      }
    }
    logger.info(`[import-zalo-pc] Preloaded ${conversationMap.size} existing conversation(s) from DB`);
  }

  // Preload contacts
  const contacts = await prisma.contact.findMany({
    where: { orgId: account.orgId },
    select: { id: true, zaloUid: true, fullName: true, avatarUrl: true },
  });
  const contactMap = new Map<string, { id: string; fullName: string; avatarUrl: string | null }>();
  for (const ct of contacts) {
    if (ct.zaloUid) {
      contactMap.set(ct.zaloUid, {
        id: ct.id,
        fullName: ct.fullName || '',
        avatarUrl: ct.avatarUrl || null,
      });
    }
  }

  let totalParsed = 0;
  let totalInserted = 0;
  let totalBatches = 0;

  // Track conversation metadata from _zconversation.zdb
  interface ConvRow {
    threadId: string;
    isGroup: boolean;
  }
  const convRows: ConvRow[] = [];

  // Pass 1: Parse conversations and contacts
  logger.info(`[import-zalo-pc] Phase 1: Reading conversation list from ${convPath}...`);
  const rlPass1 = readline.createInterface({
    input: fs.createReadStream(convPath),
    crlfDelay: Infinity,
  });

  for await (const line of rlPass1) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      const threadId = String(row.userId || '').trim();
      if (!threadId) continue;
      const isGroup = Boolean(row.isGroup || threadId.startsWith('g'));
      convRows.push({ threadId, isGroup });
    } catch {}
  }

  const groupRows = convRows.filter((c) => c.isGroup);
  const userRows = convRows.filter((c) => !c.isGroup);
  logger.info(`[import-zalo-pc] Found ${convRows.length} total conversations (${groupRows.length} groups, ${userRows.length} 1-1 chats)`);

  // Resolve user profiles via Zalo PC CDP
  const userIdsToResolve = userRows.map((u) => u.threadId);
  logger.info(`[import-zalo-pc] Resolving profiles for ${userIdsToResolve.length} 1-1 contacts via Zalo PC CDP...`);
  const userProfilesMap = await fetchUserProfilesFromZaloPc(userIdsToResolve);
  logger.info(`[import-zalo-pc] Successfully resolved ${userProfilesMap.size} user profile(s) from Zalo PC memory`);

  // Seed / create all conversations and contacts in DB
  if (!dryRun) {
    logger.info(`[import-zalo-pc] Seeding conversations and contacts into PostgreSQL...`);

    // A. Seed Groups
    for (const g of groupRows) {
      const gInfo = groupsInfoMap.get(g.threadId);
      const groupName = gInfo?.name || null;
      const groupMembersCount = gInfo?.totalMember || null;

      const conv = await prisma.conversation.upsert({
        where: {
          zaloAccountId_externalThreadId: {
            zaloAccountId: accountId,
            externalThreadId: g.threadId,
          },
        },
        create: {
          orgId: account.orgId,
          zaloAccountId: accountId,
          externalThreadId: g.threadId,
          threadType: 'group',
          groupName,
          groupMembersCount,
        },
        update: {
          groupName: groupName ?? undefined,
          groupMembersCount: groupMembersCount ?? undefined,
        },
      });
      conversationMap.set(g.threadId, conv.id);
    }

    // B. Seed Users (1-1 Chats)
    for (const u of userRows) {
      const profile = userProfilesMap.get(u.threadId);
      const displayName = profile?.dName || profile?.zaloName || null;
      const avatarUrl = profile?.avatar || null;
      const alias = profile?.alias || null;

      let contact = contactMap.get(u.threadId);
      if (!contact) {
        // Create new Contact
        const newCt = await prisma.contact.create({
          data: {
            orgId: account.orgId,
            zaloUid: u.threadId,
            fullName: displayName || 'Unknown',
            avatarUrl,
          },
          select: { id: true, fullName: true, avatarUrl: true },
        });
        contact = { id: newCt.id, fullName: newCt.fullName || '', avatarUrl: newCt.avatarUrl || null };
        contactMap.set(u.threadId, contact);
      } else if (displayName && (!contact.fullName || contact.fullName === 'Unknown')) {
        // Update existing contact if name was missing/Unknown
        await prisma.contact.update({
          where: { id: contact.id },
          data: { fullName: displayName, avatarUrl: avatarUrl || undefined },
        });
        contact.fullName = displayName;
      }

      // Upsert Friend record so FE friendship logic displays correctly
      try {
        await prisma.friend.upsert({
          where: {
            zaloAccountId_zaloUidInNick: {
              zaloAccountId: accountId,
              zaloUidInNick: u.threadId,
            },
          },
          create: {
            orgId: account.orgId,
            contactId: contact.id,
            zaloAccountId: accountId,
            zaloUidInNick: u.threadId,
            aliasInNick: alias || null,
            zaloDisplayName: displayName || null,
            zaloAvatarUrl: avatarUrl || null,
            hasConversation: true,
          },
          update: {
            aliasInNick: alias || undefined,
            zaloDisplayName: displayName || undefined,
            zaloAvatarUrl: avatarUrl || undefined,
            hasConversation: true,
          },
        });
      } catch {}

      // Upsert Conversation
      const conv = await prisma.conversation.upsert({
        where: {
          zaloAccountId_externalThreadId: {
            zaloAccountId: accountId,
            externalThreadId: u.threadId,
          },
        },
        create: {
          orgId: account.orgId,
          zaloAccountId: accountId,
          externalThreadId: u.threadId,
          threadType: 'user',
          contactId: contact.id,
        },
        update: {
          contactId: contact.id,
        },
      });
      conversationMap.set(u.threadId, conv.id);
    }
  } else {
    for (const c of convRows) {
      conversationMap.set(c.threadId, `dry-run-${c.threadId}`);
    }
  }

  logger.info(`[import-zalo-pc] Prepared ${conversationMap.size} conversation(s) for message streaming`);

  // Pass 2: Stream Messages
  logger.info(`[import-zalo-pc] Phase 2: Streaming messages from ${msgPath}...`);
  const rl = readline.createInterface({ input: fs.createReadStream(msgPath), crlfDelay: Infinity });

  let batch: any[] = [];
  const BATCH_SIZE = 1000;
  const contactUpdates = new Map<string, string>();

      const flushBatch = async () => {
        if (batch.length === 0) return;
        totalBatches++;
        if (!dryRun) {
          // In-batch deduplication by conversationId + zaloMsgId
          const seen = new Set<string>();
          const dedupedBatch: any[] = [];
          for (const item of batch) {
            if (item.zaloMsgId) {
              const k = `${item.conversationId}:${item.zaloMsgId}`;
              if (seen.has(k)) continue;
              seen.add(k);
            }
            dedupedBatch.push(item);
          }

          try {
            const res = await prisma.message.createMany({
              data: dedupedBatch,
              skipDuplicates: true,
            });
            totalInserted += res.count;
          } catch (err: any) {
            logger.warn(`[import-zalo-pc] Batch insert (${dedupedBatch.length} items) failed: ${err.message}. Retrying with smaller chunks...`);
            // Fallback 1: Chunk into 50 items
            const CHUNK = 50;
            for (let i = 0; i < dedupedBatch.length; i += CHUNK) {
              const chunk = dedupedBatch.slice(i, i + CHUNK);
              try {
                const res = await prisma.message.createMany({
                  data: chunk,
                  skipDuplicates: true,
                });
                totalInserted += res.count;
              } catch {
                // Fallback 2: Insert individually to isolate corrupt record
                for (const item of chunk) {
                  try {
                    await prisma.message.create({
                      data: item,
                    });
                    totalInserted++;
                  } catch {}
                }
              }
            }
          }
        } else {
          totalInserted += batch.length;
        }
        batch = [];
        if (totalParsed % 10000 === 0) {
          logger.info(`[import-zalo-pc] Progress: parsed ${totalParsed.toLocaleString()} msgs, inserted ${totalInserted.toLocaleString()} records`);
        }
      };

      for await (const line of rl) {
        if (!line.trim()) continue;
        if (totalParsed >= maxMessages) {
          logger.info(`[import-zalo-pc] Reached maxMessages limit: ${maxMessages}`);
          break;
        }

        try {
          const m = JSON.parse(line);
          totalParsed++;

          const fromUid = String(m.fromUid || '0');
          const toUid = String(m.toUid || '');
          const isSelf = fromUid === '0' || fromUid === account.zaloUid;

          // CORRECT THREAD ROUTING:
          // 1. If toUid starts with 'g', it is ALWAYS a group message!
          // 2. If fromUid starts with 'g', it is a group event!
          // 3. Else, it is a 1-1 chat: if self -> toUid, if contact -> fromUid.
          let threadId: string;
          if (toUid && toUid.startsWith('g')) {
            threadId = toUid;
          } else if (fromUid && fromUid.startsWith('g')) {
            threadId = fromUid;
          } else {
            threadId = isSelf ? toUid : fromUid;
          }

          if (!threadId) continue;

          let convId = conversationMap.get(threadId);
          if (!convId && !dryRun) {
            // Fallback for any conversation not present in _zconversation.zdb
            const isGroup = threadId.startsWith('g');
            const linkedContact = contactMap.get(threadId);
            const gInfo = isGroup ? groupsInfoMap.get(threadId) : null;
            const conv = await prisma.conversation.upsert({
              where: {
                zaloAccountId_externalThreadId: {
                  zaloAccountId: accountId,
                  externalThreadId: threadId,
                },
              },
              create: {
                orgId: account.orgId,
                zaloAccountId: accountId,
                externalThreadId: threadId,
                threadType: isGroup ? 'group' : 'user',
                groupName: gInfo?.name || null,
                groupMembersCount: gInfo?.totalMember || null,
                contactId: linkedContact?.id || null,
              },
              update: {},
            });
            convId = conv.id;
            conversationMap.set(threadId, convId);
          }

          if (!convId) continue;

          // Determine contentType & message payload
          const msgType = Number(m.msgType);
          const origin = String(m.originMsgType || '');
          let contentType = 'text';

          if (msgType === 2 || origin === 'chat.photo') {
            contentType = 'image';
          } else if (msgType === 19 || origin === 'share.file') {
            contentType = 'file';
          } else if (msgType === 4 || origin === 'chat.sticker') {
            contentType = 'sticker';
          } else if (msgType === 18 || origin === 'chat.video.msg') {
            contentType = 'video';
          } else if (msgType === 7 || origin === 'chat.gif') {
            contentType = 'gif';
          } else if (msgType === 3 || origin === 'chat.voice') {
            contentType = 'voice';
          } else if (msgType === 52 || origin === 'chat.webcontent') {
            contentType = 'link';
          } else if (msgType === 6 || origin === 'chat.recommended') {
            contentType = 'contact_card';
          } else if (msgType === 17 || origin === 'chat.location.new') {
            contentType = 'location';
          } else if (msgType === 26 || origin === 'group.poll') {
            contentType = 'poll';
          }

          let content = '';
          let albumKey: string | null = null;
          let albumIndex: number | null = null;
          let albumTotal: number | null = null;

          if (typeof m.message === 'string') {
            content = m.message;
          } else if (typeof m.message === 'object' && m.message !== null) {
            const obj = { ...m.message };
            let parsedParams: any = null;
            if (typeof obj.params === 'string') {
              try { parsedParams = JSON.parse(obj.params); } catch {}
            } else if (typeof obj.params === 'object') {
              parsedParams = obj.params;
            }

            if (contentType === 'file') {
              const fileSize = parseInt(parsedParams?.fileSize || '0') || 0;
              obj.name = obj.name || obj.title || 'file';
              obj.size = obj.size || fileSize;
            } else if (contentType === 'image' || contentType === 'gif') {
              obj.href = obj.href || obj.normalUrl || obj.hdUrl || obj.oriUrl || obj.thumbUrl;
              obj.thumb = obj.thumb || obj.thumbUrl || obj.normalUrl;
              if (parsedParams?.group_layout_id && parsedParams.group_layout_id !== -1 && parsedParams.group_layout_id !== '-1') {
                albumKey = String(parsedParams.group_layout_id);
                albumIndex = typeof parsedParams.id_in_group === 'number' ? parsedParams.id_in_group : null;
                albumTotal = typeof parsedParams.total_item_in_group === 'number' ? parsedParams.total_item_in_group : null;
              }
            } else if (contentType === 'video') {
              obj.href = obj.href || obj.oriUrl || obj.normalUrl || obj.hdUrl;
              obj.thumb = obj.thumb || obj.thumbUrl;
            } else if (obj.action === 'rtf' && obj.title) {
              // Zalo PC Rich Text Format message — extract actual user text
              content = String(obj.title);
            } else if (obj['0'] && typeof obj['0'] === 'object' && obj['0'].title) {
              // Zalo OA broadcast / multi-article list message
              contentType = 'link';
              obj.title = obj['0'].title;
              obj.href = obj['0'].href || obj['0'].dlink || '';
              obj.thumb = obj['0'].thumb || '';
              obj.description = obj['0'].description || '';
            }

            if (!content) {
              content = JSON.stringify(obj);
            }
          } else if (m.content) {
            content = String(m.content);
          }

          if (!content) {
            if (contentType === 'image') content = '[Hình ảnh]';
            else if (contentType === 'file') content = '[Tệp đính kèm]';
            else if (contentType === 'sticker') content = '[Sticker]';
            else if (contentType === 'video') content = '[Video]';
            else content = '[Tin nhắn]';
          }

          const sentTimestamp = parseInt(m.sendDttm || m.serverTime || String(Date.now()));
          const sentAt = new Date(isNaN(sentTimestamp) ? Date.now() : sentTimestamp);

          // Track newest message timestamp
          const currentLast = convLastMsgMap.get(convId);
          if (!currentLast || sentAt > currentLast) {
            convLastMsgMap.set(convId, sentAt);
          }

          const zaloMsgId = m.msgId ? String(m.msgId) : null;
          let zaloMsgIdNum: bigint | null = null;
          if (zaloMsgId && /^\d+$/.test(zaloMsgId)) {
            try {
              zaloMsgIdNum = BigInt(zaloMsgId);
            } catch {}
          }

          // Determine sender name
          let senderName: string | null = null;
          if (isSelf) {
            senderName = account.displayName;
          } else if (m.dName) {
            senderName = m.dName;
          } else if (contactMap.has(fromUid)) {
            senderName = contactMap.get(fromUid)!.fullName;
          }

          batch.push({
            conversationId: convId,
            zaloMsgId,
            zaloMsgIdNum,
            zaloCliMsgId: m.cliMsgId ? String(m.cliMsgId) : null,
            senderType: isSelf ? 'self' : 'contact',
            senderUid: isSelf ? account.zaloUid : fromUid,
            senderName,
            content,
            contentType,
            albumKey,
            albumIndex,
            albumTotal,
            mentions: m.mentions || undefined,
            quote: m.quote || undefined,
            sentAt,
          });

          // Recover contact name if Unknown
          if (!isSelf && m.dName && threadId) {
            const ct = contactMap.get(threadId);
            if (ct && (!ct.fullName || ct.fullName === 'Unknown')) {
              ct.fullName = m.dName;
              contactUpdates.set(ct.id, m.dName);
            }
          }

          if (batch.length >= BATCH_SIZE) {
            await flushBatch();
          }
        } catch {
          // ignore malformed lines
        }
      }

      await flushBatch();
      logger.info(`[import-zalo-pc] Finished messages table: parsed=${totalParsed.toLocaleString()}, inserted=${totalInserted.toLocaleString()}`);

      // Update lastMessageAt on conversations
      if (!dryRun && convLastMsgMap.size > 0) {
        logger.info(`[import-zalo-pc] Updating timestamps for ${convLastMsgMap.size} conversation(s)...`);
        let updatedCount = 0;
        for (const [convId, lastAt] of convLastMsgMap.entries()) {
          try {
            await prisma.conversation.updateMany({
              where: { id: convId, OR: [{ lastMessageAt: null }, { lastMessageAt: { lt: lastAt } }] },
              data: { lastMessageAt: lastAt },
            });
            updatedCount++;
          } catch {}
        }
        logger.info(`[import-zalo-pc] Finished updating timestamps (${updatedCount} conversations updated).`);
      }

      // Update recovered contact names in DB
      if (!dryRun && contactUpdates.size > 0) {
        logger.info(`[import-zalo-pc] Updating ${contactUpdates.size} recovered contact name(s)...`);
        for (const [id, fullName] of contactUpdates.entries()) {
          try {
            await prisma.contact.update({ where: { id }, data: { fullName } });
          } catch {}
        }
        logger.info(`[import-zalo-pc] Finished updating contact names.`);
      }

      return { totalParsed, totalInserted, totalConvs: conversationMap.size };
    }

// CLI runner
async function runCli() {
  const isDryRun = process.argv.includes('--dry-run');
  const isClean = process.argv.includes('--clean'); // Safe default: false (must explicitly specify --clean)
  const isAll = process.argv.includes('--all');
  const maxIdx = process.argv.indexOf('--max');
  const max = isAll ? Infinity : maxIdx !== -1 ? parseInt(process.argv[maxIdx + 1], 10) : Infinity;

  // 1. File path
  let backupPath = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null;
  if (!backupPath) {
    const pathIdx = process.argv.indexOf('--file');
    if (pathIdx !== -1) backupPath = process.argv[pathIdx + 1];
  }

  if (!backupPath || !fs.existsSync(backupPath)) {
    if (backupPath) {
      console.error(`❌ File backup không tồn tại: ${backupPath}`);
    } else {
      console.error('❌ Vui lòng chỉ định đường dẫn file backup (.zl.zip)!');
    }
    console.log(`Cách dùng: npx tsx scripts/import-zalo-pc-backup.ts /duong-dan/file_backup.zl.zip [--all] [--clean] [--dry-run]`);
    process.exit(1);
  }

  // 2. UIN & Account ID
  let uin = process.env.ZALO_UIN;
  const uinIdx = process.argv.indexOf('--uin');
  if (uinIdx !== -1) uin = process.argv[uinIdx + 1];

  let accountId = process.env.ZALO_ACCOUNT_ID;
  const accIdx = process.argv.indexOf('--account');
  if (accIdx !== -1) accountId = process.argv[accIdx + 1];

  // 3. Auto-detect from Zalo PC CDP if missing
  if (!uin || !accountId) {
    try {
      console.log('🔄 Đang tự động quét session từ Zalo PC (port 9222)...');
      const session = await fetchUinFromZaloPc();
      console.log(`✅ Tìm thấy phiên Zalo PC: ${session.displayName} (UID: ${session.uid})`);
      if (!uin) uin = session.uin;
      if (!accountId) {
        const acc = await prisma.zaloAccount.findFirst({
          where: { zaloUid: session.uid },
          select: { id: true },
        });
        if (acc) {
          accountId = acc.id;
          console.log(`✅ Tìm thấy tài khoản CRM tương ứng: ${acc.id}`);
        }
      }
    } catch (e: any) {
      console.warn(`⚠️ Không thể tự lấy UIN từ Zalo PC (port 9222): ${e.message}`);
    }
  }

  const isDir = fs.existsSync(backupPath) && fs.statSync(backupPath).isDirectory();
  if (!uin && !isDir) {
    console.error('❌ Thiếu UIN giải mã! Hãy đảm bảo Zalo PC đang mở với port 9222 hoặc truyền --uin <key>');
    process.exit(1);
  }
  if (!accountId) {
    console.error('❌ Thiếu Account ID! Hãy truyền --account <id>');
    process.exit(1);
  }

  if (isClean && !isDryRun) {
    console.warn('⚠️  CẢNH BÁO: Đang bật cờ --clean! Toàn bộ hội thoại & tin nhắn của nick này sẽ bị xóa trước khi nạp lại.');
  }

  console.log(`🚀 Bắt đầu import: file=${backupPath}, accountId=${accountId}, clean=${isClean}, uin=${uin.slice(0, 6)}...`);
  const stats = await importZaloPcBackup({
    backupPath,
    uin,
    accountId,
    maxMessages: max,
    dryRun: isDryRun,
    clean: isClean,
  });

  console.log('🎉 Hoàn tất import:', stats);
  process.exit(0);
}

if (process.argv[1]?.endsWith('import-zalo-pc-backup.ts')) {
  runCli().catch((err) => {
    console.error('❌ Import failed:', err);
    process.exit(1);
  });
}
