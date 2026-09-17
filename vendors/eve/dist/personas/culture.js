export const CULTURES = {
    "en-US": {
        locale: "en-US",
        name: "United States (English)",
        readingDirection: "ltr",
        dateFormat: "MDY",
        currency: "$",
        decimalSeparator: ".",
        firstDayOfWeek: 0,
        privacyExpectation: 0.4,
        nameOrder: "given-family",
        languageHints: ["color", "center", "zip"],
    },
    "en-GB": {
        locale: "en-GB",
        name: "United Kingdom (English)",
        readingDirection: "ltr",
        dateFormat: "DMY",
        currency: "£",
        decimalSeparator: ".",
        firstDayOfWeek: 1,
        privacyExpectation: 0.6,
        nameOrder: "given-family",
        languageHints: ["colour", "centre", "postcode"],
    },
    "de-DE": {
        locale: "de-DE",
        name: "Germany (German)",
        readingDirection: "ltr",
        dateFormat: "DMY",
        currency: "€",
        decimalSeparator: ",",
        firstDayOfWeek: 1,
        privacyExpectation: 0.85,
        nameOrder: "given-family",
        languageHints: ["Anmelden", "Datenschutz", "Konto"],
    },
    "fr-FR": {
        locale: "fr-FR",
        name: "France (French)",
        readingDirection: "ltr",
        dateFormat: "DMY",
        currency: "€",
        decimalSeparator: ",",
        firstDayOfWeek: 1,
        privacyExpectation: 0.75,
        nameOrder: "given-family",
        languageHints: ["Connexion", "Compte", "Rechercher"],
    },
    "ja-JP": {
        locale: "ja-JP",
        name: "Japan (Japanese)",
        readingDirection: "ltr",
        dateFormat: "YMD",
        currency: "¥",
        decimalSeparator: ".",
        firstDayOfWeek: 0,
        privacyExpectation: 0.7,
        nameOrder: "family-given",
        languageHints: ["ログイン", "アカウント", "検索"],
    },
    "ar-SA": {
        locale: "ar-SA",
        name: "Saudi Arabia (Arabic)",
        readingDirection: "rtl",
        dateFormat: "DMY",
        currency: "﷼",
        decimalSeparator: ".",
        firstDayOfWeek: 0,
        privacyExpectation: 0.7,
        nameOrder: "given-family",
        languageHints: ["تسجيل الدخول", "حساب", "بحث"],
    },
    "he-IL": {
        locale: "he-IL",
        name: "Israel (Hebrew)",
        readingDirection: "rtl",
        dateFormat: "DMY",
        currency: "₪",
        decimalSeparator: ".",
        firstDayOfWeek: 0,
        privacyExpectation: 0.65,
        nameOrder: "given-family",
        languageHints: ["התחברות", "חשבון", "חיפוש"],
    },
};
export const DEFAULT_CULTURE = CULTURES["en-US"];
export function listCultures() {
    return Object.values(CULTURES);
}
export function getCulture(locale) {
    const c = CULTURES[locale];
    if (!c)
        throw new Error(`Unknown culture "${locale}". Known: ${Object.keys(CULTURES).join(", ")}`);
    return c;
}
export function withCulture(persona, culture) {
    return { ...persona, culture };
}
export function cultureOf(persona) {
    return persona.culture ?? DEFAULT_CULTURE;
}
//# sourceMappingURL=culture.js.map