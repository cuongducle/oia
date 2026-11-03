/**
 * FAQ schema, single source (teardown #4): derives FAQPage JSON-LD from the
 * VISIBLE FAQ on whichever page loads this — one implementation instead of
 * four inline copies, and the schema can never drift from the copy again.
 * Selector covers both the homepage (#faq) and content pages (.faq).
 */
const qa = [...document.querySelectorAll("#faq details, .faq details")].map((d) => ({
  "@type": "Question",
  name: d.querySelector("summary").textContent.trim(),
  acceptedAnswer: { "@type": "Answer", text: d.querySelector("p").textContent.trim() },
}));
if (qa.length) {
  const ld = document.createElement("script");
  ld.type = "application/ld+json";
  ld.textContent = JSON.stringify({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: qa });
  document.head.appendChild(ld);
}
