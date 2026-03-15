/**
 * Shared stop words for Swedish/English text processing.
 * Used by entity-extract, topic-extract, and title-polish.
 */

export const STOP_WORDS = new Set([
  // Swedish — common words
  "och", "att", "det", "som", "för", "med", "har", "kan", "inte", "den",
  "ett", "var", "från", "till", "ska", "vid", "nya", "alla", "efter",
  "när", "utan", "eller", "men", "här", "där", "dess", "hade", "hon",
  "han", "vara", "vill", "ser", "ang", "ärende", "ärenden", "ärendet",
  "detta", "dessa", "behöver", "blir", "borde", "bara", "sedan",
  "också", "redan", "mer", "mycket", "genom", "kunde", "skulle",
  "samma", "andra", "hela", "igen", "flera", "dock", "vad", "hur",

  // English — common words
  "the", "and", "for", "with", "not", "this", "that", "from", "has", "was",
  "are", "have", "been", "will", "can", "new", "all", "about", "into",
  "just", "some", "than", "them", "then", "also", "only",

  // Email prefixes
  "fwd", "fw", "re", "sv", "vb",

  // Ticket/email boilerplate
  "angående", "gäller", "hej", "tack", "mvh", "mailto",
  "ref", "service", "request", "incident", "problem", "fel", "fråga",
  "akut", "prio", "hög", "låg", "info", "information",

  // Generic words that look like proper nouns but aren't
  "okänd", "test", "prod", "dev", "staging", "server", "system",
  "ärenderubrik", "felanmälan", "beställning",
  "standardklient", "produktion", "klient",

  // Priority/status labels
  "normal", "kritisk", "brådskande", "urgent",
  "high", "medium", "low", "critical",
  "öppen", "stängd", "löst", "closed", "open", "resolved",

  // English filler
  "used", "free", "less", "more", "some", "like",
  "need", "please", "want", "regarding",
]);
