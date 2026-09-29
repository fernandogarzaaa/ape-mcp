// Context management — bounded history with recoverable digests.
// When estimated history tokens exceed the profile cap, older tool-result turns are
// replaced by one-line digests (tool + args hash + summary). The full data remains in
// runs.db steps, so nothing is lost — the model sees less, the ledger keeps everything.
export function estimateTokens(messages) {
  return Math.ceil(JSON.stringify(messages).length / 4);
}

export function compressHistory(messages, { maxHistoryTokens = 60000, keepRecentTurns = 4 } = {}) {
  const before = estimateTokens(messages);
  if (before <= maxHistoryTokens) return { messages, compressed: 0, savedTokens: 0 };
  // Never compress the system/objective head (first message) — only middle turns.
  // A "turn" is an assistant message + its tool results; keep the tail intact.
  const head = messages.slice(0, 1);
  const tail = messages.slice(-keepRecentTurns * 2);
  const middle = messages.slice(1, Math.max(1, messages.length - keepRecentTurns * 2));
  let compressed = 0;
  const digested = middle.map((m) => {
    if (m.role === "tool") {
      compressed++;
      return { ...m, content: `[digested tool result ${m.toolCallId ?? ""}: ${(m.content ?? "").slice(0, 160)}…]` };
    }
    if (m.role === "assistant" && m.toolCalls?.length) {
      return { role: "assistant", content: (m.content ?? "").slice(0, 200), toolCalls: m.toolCalls.map((tc) => ({ ...tc, args: {} })) };
    }
    return { role: m.role, content: String(m.content ?? "").slice(0, 300) };
  });
  return { messages: [...head, ...digested, ...tail], compressed, savedTokens: Math.max(0, before - estimateTokens([...head, ...digested, ...tail])) };
}