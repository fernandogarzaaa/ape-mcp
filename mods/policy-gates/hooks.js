// policy-gates hooks: confirm destructive ops; pure functions, throw-safe (loader catches).
export const preCall = async (name, args) => {
  if (name === "godmode_evolve" && (args.action === "accept" || args.action === "apply") && args.confirm !== true) {
    // Return unchanged; server.js emits input_required elicitation. Mod only annotates.
    return { ...args, _policy: "destructive-confirm-required" };
  }
  if (name === "godmode_orchestrate" && args.op === "release" && args.force === true) {
    return { ...args, _policy: "force-release-logged" };
  }
  return args;
};
export const postCall = async (name, args, result) => result;
