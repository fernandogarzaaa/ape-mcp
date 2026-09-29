/** Safe-default resolution: anything but explicit "accept" dismisses. */
export function resolveNativeDialogHandling(action) {
    return action === "accept" ? "accepted" : "dismissed";
}
export function recordNativeDialog(pending, message, action) {
    const autoHandled = resolveNativeDialogHandling(action);
    pending.push({ text: message, autoHandled });
    return autoHandled;
}
/** Surface pending native dialogs on a snapshot (clears the queue). */
export function mergeNativeDialogs(dialogs, pending) {
    if (pending.length === 0)
        return dialogs;
    const merged = [
        ...dialogs,
        ...pending.map((d) => ({
            text: d.text,
            box: null,
            source: "native",
            autoHandled: d.autoHandled,
        })),
    ];
    pending.length = 0;
    return merged;
}
//# sourceMappingURL=nativeDialog.js.map