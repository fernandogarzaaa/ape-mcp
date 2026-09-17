import type { Persona } from "./persona.js";
/**
 * Cultural personas.
 *
 * Cultural profile shapes how an interface is read and what conventions the
 * operator expects: reading direction, date/number/currency formats,
 * privacy and form expectations, navigation habits. Mismatches between the
 * operator's expectations and the interface are perceived as friction and
 * lower trust (Marcus & Gould 2000 on culture in UI; Hofstede dimensions as
 * a coarse background). EVE uses the profile to (a) drive attention scanning
 * direction and (b) flag localization/convention mismatches as findings.
 */
export interface CultureProfile {
    readonly locale: string;
    readonly name: string;
    readonly readingDirection: "ltr" | "rtl";
    /** Expected date pattern, checked against visible dates. */
    readonly dateFormat: "MDY" | "DMY" | "YMD";
    /** Expected currency symbol/code. */
    readonly currency: string;
    /** Decimal separator the operator expects. */
    readonly decimalSeparator: "." | ",";
    /** First day of week (0 = Sunday). */
    readonly firstDayOfWeek: 0 | 1;
    /** Elevated sensitivity to privacy/data requests (0..1). */
    readonly privacyExpectation: number;
    /** Name order the operator expects in forms. */
    readonly nameOrder: "given-family" | "family-given";
    readonly languageHints: readonly string[];
}
export declare const CULTURES: Record<string, CultureProfile>;
export declare const DEFAULT_CULTURE: CultureProfile;
export declare function listCultures(): readonly CultureProfile[];
export declare function getCulture(locale: string): CultureProfile;
/**
 * A persona carrying a cultural profile. Reading direction and privacy
 * sensitivity are read by the attention model and trust/vision checks.
 */
export interface CulturedPersona extends Persona {
    readonly culture: CultureProfile;
}
export declare function withCulture(persona: Persona, culture: CultureProfile): CulturedPersona;
export declare function cultureOf(persona: Persona): CultureProfile;
//# sourceMappingURL=culture.d.ts.map