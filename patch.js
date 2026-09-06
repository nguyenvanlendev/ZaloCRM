const fs = require('fs');
const path = 'backend/src/modules/chat/chat-operations-routes.ts';
let code = fs.readFileSync(path, 'utf8');

// 1. Add import
if (!code.includes('popEarlyDelivered')) {
    code = code.replace(
        "import { getUserFullName } from './chat-helpers.js';",
        "import { getUserFullName, popEarlyDelivered } from './chat-helpers.js';"
    );
}

// 2. Add deliveredAt to all prisma.message.create for senderType: 'self'
// Using regex to match prisma.message.create blocks and insert deliveredAt if sentAt exists
code = code.replace(
    /(const \w+ = await prisma\.message\.create\(\{\s*data: \{[\s\S]*?)(sentAt:\s*new Date\(\),)([\s\S]*?\}\s*\S*\s*\}\);)/g,
    (match, p1, p2, p3) => {
        if (match.includes("senderType: 'self'") || match.includes('senderType: \'self\'') || match.includes("senderType: msg.isSelf ? 'self' : 'contact'")) {
            if (!match.includes('deliveredAt:')) {
                // Ensure zaloMsgId is available in scope, we can safely just add:
                // deliveredAt: (zaloMsgId && popEarlyDelivered(zaloMsgId)) ? new Date() : null,
                // But wait, what if the variable is not named zaloMsgId?
                // In chat-operations-routes.ts, extractZaloMsgId usually returns `zaloMsgId`.
                // Let's just blindly add it, but wait: is `zaloMsgId` always defined?
                // Looking at chat-operations-routes.ts, it uses `zaloMsgId = extractZaloMsgId(result)`
                return p1 + p2 + "\n            deliveredAt: (typeof zaloMsgId !== 'undefined' && zaloMsgId && popEarlyDelivered(zaloMsgId)) ? new Date() : null," + p3;
            }
        }
        return match;
    }
);

fs.writeFileSync(path, code);
