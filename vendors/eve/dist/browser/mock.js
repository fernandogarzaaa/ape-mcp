import { VISUAL_SURFACE } from "../surface/capabilities.js";
/** A small but realistic demo app: landing → login → dashboard → settings. */
export const DEMO_APP = {
    name: "Acme Notes",
    start: "landing",
    screens: [
        {
            id: "landing",
            title: "Acme Notes — Simple note taking",
            elements: [
                { role: "heading", text: "Acme Notes" },
                { role: "text", text: "The simplest way to capture your ideas, wherever you are." },
                { role: "button", text: "Get started", goto: "signup" },
                { role: "link", text: "Log in", goto: "login" },
                { role: "link", text: "Pricing", goto: "pricing" },
            ],
        },
        {
            id: "login",
            title: "Log in — Acme Notes",
            elements: [
                { role: "heading", text: "Welcome back" },
                { role: "textbox", text: "Email address", editable: true },
                { role: "textbox", text: "Password", editable: true },
                { role: "button", text: "Log in", goto: "dashboard" },
                { role: "link", text: "Forgot password?", goto: "forgot" },
            ],
        },
        {
            id: "forgot",
            title: "Reset password — Acme Notes",
            elements: [
                { role: "heading", text: "Reset your password" },
                { role: "textbox", text: "Email address", editable: true },
                { role: "button", text: "Send reset link", goto: "forgot-sent" },
                { role: "link", text: "Back to log in", goto: "login" },
            ],
        },
        {
            id: "forgot-sent",
            title: "Check your email — Acme Notes",
            elements: [
                { role: "heading", text: "Check your email" },
                { role: "text", text: "We sent a reset link to your email address." },
                { role: "link", text: "Back to log in", goto: "login" },
            ],
        },
        {
            id: "signup",
            title: "Sign up — Acme Notes",
            elements: [
                { role: "heading", text: "Create your account" },
                { role: "textbox", text: "Full name", editable: true },
                { role: "textbox", text: "Email address", editable: true },
                { role: "textbox", text: "Password", editable: true },
                { role: "button", text: "Create account", goto: "dashboard" },
                { role: "link", text: "Log in instead", goto: "login" },
            ],
        },
        {
            id: "pricing",
            title: "Pricing — Acme Notes",
            elements: [
                { role: "heading", text: "Pricing" },
                { role: "text", text: "Free forever for personal use. Teams from $4 per user." },
                // Deliberately flawed copy so demo runs surface real findings:
                // shouty caps + jargon + tiny low-contrast text.
                {
                    role: "text",
                    text: "SYNC EVERYTHING VIA THE WEBHOOK API TOKEN",
                    fontSize: 9,
                    color: "#c7c7c7",
                    backgroundColor: "#ffffff",
                },
                { role: "button", text: "Get started", goto: "signup" },
                { role: "link", text: "Home", goto: "landing" },
            ],
        },
        {
            id: "dashboard",
            title: "Your notes — Acme Notes",
            latencyMs: 600,
            elements: [
                { role: "heading", text: "Your notes" },
                { role: "button", text: "New note", goto: "editor" },
                { role: "listitem", text: "Meeting notes — Monday standup" },
                { role: "listitem", text: "Ideas for the offsite" },
                { role: "textbox", text: "Search notes", editable: true },
                { role: "link", text: "Settings", goto: "settings" },
                { role: "button", text: "Export all", goto: "export" },
            ],
        },
        {
            id: "editor",
            title: "New note — Acme Notes",
            elements: [
                { role: "heading", text: "New note" },
                { role: "textbox", text: "Title", editable: true },
                { role: "textbox", text: "Write something…", editable: true },
                { role: "button", text: "Save", goto: "dashboard" },
                { role: "button", text: "Delete", goto: "dashboard" },
                { role: "link", text: "Back", goto: "dashboard" },
            ],
        },
        {
            id: "settings",
            title: "Settings — Acme Notes",
            elements: [
                { role: "heading", text: "Settings" },
                { role: "checkbox", text: "Email notifications" },
                { role: "checkbox", text: "Dark mode" },
                { role: "button", text: "Save changes", goto: "settings" },
                { role: "link", text: "Back to notes", goto: "dashboard" },
            ],
        },
        {
            id: "export",
            title: "Export — Acme Notes",
            elements: [
                { role: "heading", text: "Export your notes" },
                { role: "button", text: "Download .zip", goto: "dashboard" },
                { role: "link", text: "Back", goto: "dashboard" },
            ],
        },
    ],
};
export class MockAdapter {
    name = "mock";
    /** Visual/spatial like a real browser, but never produces a screenshot. */
    capabilities = { ...VISUAL_SURFACE, canScreenshot: false };
    app;
    currentId;
    history = [];
    viewport = { width: 1280, height: 800 };
    scrollY = 0;
    typedInto = new Set();
    focusedIndex = -1;
    opened = false;
    constructor(app = DEMO_APP) {
        this.app = app;
        this.currentId = app.start;
        for (const screen of app.screens) {
            for (const el of screen.elements) {
                if (el.goto && !app.screens.some((s) => s.id === el.goto)) {
                    throw new Error(`Mock app "${app.name}": screen "${screen.id}" links to unknown screen "${el.goto}"`);
                }
            }
        }
    }
    async open(url, viewport) {
        this.viewport = viewport;
        this.opened = true;
        const target = url.replace(/^mock:\/*/, "");
        if (target && this.app.screens.some((s) => s.id === target))
            this.currentId = target;
        this.history = [this.currentId];
    }
    async snapshot() {
        if (!this.opened)
            throw new Error("MockAdapter: call open() first");
        const screen = this.screen();
        const elements = this.layout(screen);
        return {
            url: `mock://${this.app.name.toLowerCase().replace(/\s+/g, "-")}/${screen.id}`,
            title: screen.title,
            viewport: this.viewport,
            scrollY: this.scrollY,
            scrollHeight: Math.max(this.viewport.height, elements.length * 72 + 120),
            elements,
            dialogs: [],
            loadingIndicator: false,
        };
    }
    async screenshot() {
        return null; // The mock world has no pixels.
    }
    async moveMouse() { }
    async clickAt(point) {
        const screen = this.screen();
        const elements = this.layout(screen);
        const hit = elements.find((el) => point.x >= el.box.x &&
            point.x <= el.box.x + el.box.width &&
            point.y >= el.box.y &&
            point.y <= el.box.y + el.box.height);
        if (!hit)
            return;
        this.focusedIndex = hit.id;
        const spec = screen.elements[hit.id];
        if (spec?.goto && !spec.disabled)
            this.go(spec.goto);
    }
    async doubleClickAt(point) {
        await this.clickAt(point);
    }
    async typeText(text) {
        const screen = this.screen();
        const spec = screen.elements[this.focusedIndex];
        if (spec?.editable)
            this.typedInto.add(`${screen.id}:${this.focusedIndex}`);
        void text;
    }
    async pressKey(key) {
        const screen = this.screen();
        if (key === "Tab") {
            const interactiveIdxs = screen.elements
                .map((el, i) => ({ el, i }))
                .filter(({ el }) => !el.disabled &&
                (el.editable ||
                    el.goto ||
                    el.role === "button" ||
                    el.role === "link" ||
                    el.role === "checkbox"))
                .map(({ i }) => i);
            if (interactiveIdxs.length === 0)
                return;
            const pos = interactiveIdxs.indexOf(this.focusedIndex);
            this.focusedIndex = interactiveIdxs[(pos + 1) % interactiveIdxs.length];
        }
        else if (key === "Enter") {
            const spec = screen.elements[this.focusedIndex];
            if (spec?.goto && !spec.disabled)
                this.go(spec.goto);
        }
    }
    async scrollBy(deltaY) {
        const snap = await this.snapshot();
        this.scrollY = Math.max(0, Math.min(snap.scrollHeight - this.viewport.height, this.scrollY + deltaY));
    }
    async goBack() {
        if (this.history.length > 1) {
            this.history.pop();
            this.currentId = this.history[this.history.length - 1];
            this.scrollY = 0;
            this.focusedIndex = -1;
        }
    }
    async navigate(url) {
        const target = url
            .replace(/^mock:\/*/, "")
            .split("/")
            .pop() ?? "";
        if (this.app.screens.some((s) => s.id === target))
            this.go(target);
    }
    async close() {
        this.opened = false;
    }
    /* ---------------------------------------------------------------- */
    go(id) {
        this.currentId = id;
        this.history.push(id);
        this.scrollY = 0;
        this.focusedIndex = -1;
    }
    screen() {
        const screen = this.app.screens.find((s) => s.id === this.currentId);
        if (!screen)
            throw new Error(`Mock app: unknown screen "${this.currentId}"`);
        return screen;
    }
    /** Simple single-column layout; positions are viewport-relative. */
    layout(screen) {
        const out = [];
        let y = 60 - this.scrollY;
        screen.elements.forEach((spec, index) => {
            const role = spec.role ?? "text";
            const height = spec.height ?? (role === "heading" ? 48 : role === "textbox" ? 40 : 36);
            const width = spec.width ?? Math.min(this.viewport.width - 120, role === "heading" ? 600 : 420);
            const typed = this.typedInto.has(`${screen.id}:${index}`);
            out.push({
                id: index,
                role,
                text: typed && spec.editable ? `${spec.text} (filled)` : spec.text,
                box: { x: 60, y, width, height },
                interactive: !!spec.goto ||
                    !!spec.editable ||
                    role === "button" ||
                    role === "link" ||
                    role === "checkbox" ||
                    role === "tab",
                disabled: spec.disabled ?? false,
                editable: spec.editable ?? false,
                focused: index === this.focusedIndex,
                clippedByViewport: false,
                color: spec.color ?? "#1f2430",
                backgroundColor: spec.backgroundColor ?? "#ffffff",
                fontSize: spec.fontSize ?? (role === "heading" ? 28 : 15),
            });
            y += height + 24;
        });
        return out;
    }
}
//# sourceMappingURL=mock.js.map