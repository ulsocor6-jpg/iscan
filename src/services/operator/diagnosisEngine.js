// src/services/operator/diagnosisEngine.js

import knowledgeBase from "./knowledgeBase.js";

export function diagnose(event) {

    if (!event) return null;

    // ---------------------------------------------------------
    // 1. Try structured rule matching first
    // ---------------------------------------------------------

    for (const rule of knowledgeBase) {

        if (typeof rule.match === "function") {

            try {

                if (rule.match(event)) {

                    return {

                        code: rule.code,

                        title: rule.title,

                        severity: rule.severity,

                        confidence: rule.confidence,

                        recommendation: rule.recommendation

                    };

                }

            } catch (err) {

                console.error(
                    `[Operator] Rule "${rule.code}" failed:`,
                    err.message
                );

            }

        }

    }

    // ---------------------------------------------------------
    // 2. Legacy text-pattern matching
    // ---------------------------------------------------------

    const searchableText = [

        event.message || "",

        JSON.stringify(event.metadata || {})

    ].join(" ").toLowerCase();

    for (const rule of knowledgeBase) {

        if (!rule.patterns) continue;

        const matched = rule.patterns.some(pattern => {

            if (pattern instanceof RegExp) {
                return pattern.test(searchableText);
            }

            return searchableText.includes(
                String(pattern).toLowerCase()
            );

        });

        if (matched) {

            return {

                code: rule.code,

                title: rule.title,

                severity: rule.severity,

                confidence: rule.confidence,

                recommendation: rule.recommendation

            };

        }

    }

    // ---------------------------------------------------------
    // 3. Unknown Incident
    // ---------------------------------------------------------

    return {

        code: "UNKNOWN",

        title: "Unknown Incident",

        severity: "WARNING",

        confidence: 25,

        recommendation: "Review the inspector timeline."

    };

}
