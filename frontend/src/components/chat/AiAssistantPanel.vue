<template>
  <div class="ai-assistant-panel">
    <!-- Header -->
    <div class="ai-header">
      <div class="mtp-icon">✨</div>
      <div class="header-text">
        <h3>Trợ lý AI Đào tạo</h3>
        <p>Hỏi đáp trực tiếp với Knowledge Base</p>
      </div>
      <button class="clear-btn" @click="clearHistory" title="Xóa lịch sử chat">
        🗑️
      </button>
    </div>

    <!-- Message List -->
    <div class="ai-messages" ref="messagesContainer">
      <div v-if="messages.length === 0" class="empty-state">
        <p>Hãy thử hỏi: <em>"Studyway có những khóa học nào?"</em> hoặc <em>"Chính sách hoàn tiền ra sao?"</em></p>
      </div>
      <div 
        v-for="(msg, index) in messages" 
        :key="index"
        :class="['chat-msg', msg.role === 'user' ? 'msg-user' : 'msg-ai']"
      >
        <div class="msg-avatar">{{ msg.role === 'user' ? '👤' : '🤖' }}</div>
        <div class="msg-content">
          <div class="msg-text" v-html="formatContent(msg.content)"></div>
        </div>
      </div>
      
      <div v-if="isLoading" class="chat-msg msg-ai loading">
        <div class="msg-avatar">🤖</div>
        <div class="msg-content">
          <div class="typing-indicator">
            <span></span><span></span><span></span>
          </div>
        </div>
      </div>
    </div>

    <!-- Input Area -->
    <div class="ai-input-area">
      <input 
        v-model="query" 
        @keyup.enter="sendMessage"
        type="text" 
        placeholder="Nhập câu hỏi..." 
        :disabled="isLoading"
      />
      <button @click="sendMessage" :disabled="isLoading || !query.trim()">
        ➤
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue';
import { api } from '@/api';
import { useToast } from '@/composables/use-toast';

const toast = useToast();

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const messages = ref<Message[]>([]);
const query = ref('');
const isLoading = ref(false);
const messagesContainer = ref<HTMLElement | null>(null);

const formatContent = (text: string) => {
  if (!text) return '';
  return text.replace(/\n/g, '<br/>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
};

const scrollToBottom = () => {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
    }
  });
};

const clearHistory = () => {
  messages.value = [];
};

const sendMessage = async () => {
  const text = query.value.trim();
  if (!text || isLoading.value) return;

  // Add user message
  messages.value.push({ role: 'user', content: text });
  query.value = '';
  isLoading.value = true;
  scrollToBottom();

  try {
    // Send to backend
    // Lấy history (bỏ message cuối cùng vừa thêm vì backend có thể chỉ cần context trước đó, 
    // nhưng ở đây ta gửi history đầy đủ các tin trước câu hỏi hiện tại)
    const history = messages.value.slice(0, -1).map(m => ({ role: m.role, content: m.content }));
    
    const res = await api.post('/ai/assistant/chat', {
      query: text,
      history: history
    });

    if (res.data && res.data.answer) {
      messages.value.push({ role: 'assistant', content: res.data.answer });
    } else {
      messages.value.push({ role: 'assistant', content: '(Không có phản hồi từ AI)' });
    }
  } catch (error: any) {
    console.error('Error chatting with AI:', error);
    toast.error('Có lỗi khi kết nối với AI Assistant.');
    messages.value.push({ role: 'assistant', content: 'Xin lỗi, tôi đang gặp sự cố kết nối!' });
  } finally {
    isLoading.value = false;
    scrollToBottom();
  }
};
</script>

<style scoped>
.ai-assistant-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-surface, #ffffff);
  border-left: 1px solid var(--border-color, #e0e0e0);
}

.ai-header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color, #e0e0e0);
  background: var(--bg-surface-alt, #f9f9f9);
}

.mtp-icon {
  font-size: 24px;
  margin-right: 12px;
}

.header-text h3 {
  margin: 0;
  font-size: 16px;
  color: var(--text-primary, #333);
}

.header-text p {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--text-secondary, #666);
}

.clear-btn {
  margin-left: auto;
  background: transparent;
  border: none;
  font-size: 18px;
  cursor: pointer;
  opacity: 0.6;
  transition: opacity 0.2s;
}

.clear-btn:hover {
  opacity: 1;
}

.ai-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.empty-state {
  text-align: center;
  color: var(--text-secondary, #666);
  margin-top: 40px;
  font-size: 14px;
}

.chat-msg {
  display: flex;
  gap: 12px;
  max-width: 90%;
}

.msg-user {
  align-self: flex-end;
  flex-direction: row-reverse;
}

.msg-ai {
  align-self: flex-start;
}

.msg-avatar {
  font-size: 24px;
}

.msg-content {
  background: var(--bg-surface-alt, #f0f0f0);
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.5;
  color: var(--text-primary, #333);
}

.msg-user .msg-content {
  background: var(--primary-color, #0068ff);
  color: white;
}

.ai-input-area {
  display: flex;
  padding: 12px;
  border-top: 1px solid var(--border-color, #e0e0e0);
  gap: 8px;
}

.ai-input-area input {
  flex: 1;
  padding: 10px 16px;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 20px;
  outline: none;
  font-size: 14px;
}

.ai-input-area input:focus {
  border-color: var(--primary-color, #0068ff);
}

.ai-input-area button {
  background: var(--primary-color, #0068ff);
  color: white;
  border: none;
  border-radius: 50%;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.ai-input-area button:disabled {
  background: #ccc;
  cursor: not-allowed;
}

/* Typing Indicator */
.typing-indicator span {
  display: inline-block;
  width: 6px;
  height: 6px;
  background-color: var(--text-secondary, #666);
  border-radius: 50%;
  margin: 0 2px;
  animation: typing 1.4s infinite ease-in-out both;
}

.typing-indicator span:nth-child(1) { animation-delay: -0.32s; }
.typing-indicator span:nth-child(2) { animation-delay: -0.16s; }

@keyframes typing {
  0%, 80%, 100% { transform: scale(0); }
  40% { transform: scale(1); }
}
</style>
