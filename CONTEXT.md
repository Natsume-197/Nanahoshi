# Nanahoshi Library

Nanahoshi organizes a shared digital library and reconciles catalog records from local files and external sources.

## Language

**Playback Session**:
One actively reading or listening consumption context bound to one authenticated device session. A member using the same publication from two devices produces two Playback Sessions, each retaining its own client, device and current progress context; browser tabs sharing an authenticated session resolve to one row with its most recent activity. An authenticated but non-consuming device is not a Playback Session. It is live-only telemetry: a clean close removes it immediately and a missing heartbeat removes it after 90 seconds; its title is never retained as administrative consumption history.
_Avoid_: User presence, reading progress, active member

**Security Audit Event**:
An immutable administrative record of a security-relevant authentication or session action: a successful or failed sign-in, sign-out, session revocation, password change, or role change. It records the originating server when one is active, attempted identity where known, client/device and full IP address; events are retained for 90 days and can be filtered by outcome, user, server, and device. Every authentication origin — web, OAuth, OPDS or API — emits the same event with its origin identified. A daily purge alone deletes expired events.
_Avoid_: Presence event, notification, current session

**Audit Actor**:
The authenticated principal that initiated an administrative security action. It is distinct from the Audit Subject for actions such as session revocation and role change.
_Avoid_: Event subject, affected user, current session

**Audit Subject**:
The user or authenticated session affected by a Security Audit Event. It is distinct from the Audit Actor for an administrative action and ordinarily coincides with it for authentication events.
_Avoid_: Audit actor, initiator, event author

**Audit Delivery Failure**:
The technical condition in which a Security Audit Event cannot be persisted. It emits a structured server error but never blocks the user action that caused it; the absent event is an explicit gap rather than a fabricated audit record.
_Avoid_: Authentication failure, audit event, user-facing security notification

**Download Delivery Event**:
An immutable administrative record that Nanahoshi authorized and began delivering a downloadable ebook, audiobook file, audiobook archive, or Media Series archive to a member. It snapshots the member, server, catalog item, delivered filename, request source, device and IP address, and is retained for 90 days; it does not claim that the client received every byte because completion occurs outside the server's observable boundary.
_Avoid_: Security Audit Event, reading activity, completed download

**Instance Activity Console**:
The global administrative surface that lists Playback Sessions and Security Audit Events across every server. In its first version only the global Nanahoshi administrator may access it; organization roles and owners have no access.
_Avoid_: Server dashboard, member activity rail, organization settings

**Administrative Privacy Override**:
The narrowly scoped exception allowing the global Nanahoshi administrator to see a Playback Session's publication even when its member disabled sharing reading activity. It applies only inside the Instance Activity Console and does not change what other members can see.
_Avoid_: Share Reading Activity preference, public presence

**Catalog Identity**:
The domain decision that two records describe the same catalog entity at the requested identity level. All remote book and audiobook providers use one discovery, ranking, preliminary assessment, hydration, final assessment, and merge pipeline. The record's media kind selects the rules inside `catalogIdentity`: written books compare edition-level identity using explicit identity evidence, while audiobooks use Audiobook Quick Match with Audiobookshelf-compatible matching semantics. Discovery, Candidate Ranking, canonical metadata selection, merging, and persistence remain outside the module.
_Avoid_: Search relevance, metadata similarity

**Catalog Enrichment Pipeline**:
The provider-ordered process that discovers, ranks, preliminarily assesses, hydrates, finally assesses, and merges remote metadata candidates for a catalog record. The record's media kind selects the identity and merge policies, and only a final Confirmed Catalog Identity Verdict permits automatic enrichment.
_Avoid_: Remote Catalog Reconciliation, provider-specific enrichment chain

**Enrichment Admission**:
The decision of whether a catalog record may enter the Catalog Enrichment Pipeline now. It is settled authoritatively when the work is picked up rather than when it is queued, because library pause, archival and cancellation happen while the work waits. An automatic trigger obeys every rule; an explicit human request overrides all of them except a hidden duplicate copy, which is never enriched. A denial names its reason and is never silent.
_Avoid_: Job guard, skip check, queue as source of truth

**Content Form**:
Whether a publication is delivered as flowing text or as a sequence of page images — a manga, art book or catalogue. It is read from the file itself, from what the package declares about its layout and, failing that, from how much writing sits on each page. It is never inferred from a title, a filename or a Metadata Profile, because an adaptation shares its title and its original author with the work it adapts and no comparison of the two can separate them. A file that cannot be measured is text, so an extraction gap never costs a book its metadata.
_Avoid_: File type, media type, genre, manga flag

**Source Format**:
The physical ebook encoding or container opened by the parser, such as EPUB, MOBI, or CBZ. It determines extraction but never selects a Reader Presentation directly.
_Avoid_: Content Form, reader type

**Reader Presentation**:
The resolved reading experience for a publication. It combines Read As with the applicable Text Layout or Comic Layout, then selects an internal reading engine. Source Format and Content Form may inform the resolution but are not themselves presentation choices.
_Avoid_: Reading Mode, reader type, EPUB mode, manga flag, image mode

**Reader Presentation Preference**:
The reader's per-book Read As choice and, when reading as text, its Text Layout. Automatic selection treats Content Form and publication metadata as recommendations, while an explicit choice takes precedence without changing facts extracted from the file.
_Avoid_: Content Form override, forced file type

**Read As**:
The reader-facing choice of how a publication should be presented: automatically according to its Content Form, as flowing text, or as comic/manga pages. It is independent of Source Format — an EPUB can contain either text or fixed page artwork. After this choice, Text Layout or Comic Layout controls how that presentation is arranged.
_Avoid_: EPUB mode, View mode, Reading Mode

**Text Layout**:
How flowing text is arranged after Read As resolves to text: as a continuous scroll or as paginated text. It does not determine whether the publication is text or comic/manga.
_Avoid_: Reading Mode, View Mode

**Comic Layout**:
How page artwork is arranged after Read As resolves to comic/manga: a single page, a two-page spread, a horizontal strip, or a vertical strip. It does not classify the publication or select its Source Format.
_Avoid_: Reading Mode, View Mode, manga flag

**Provider Coverage**:
The Content Forms a provider actually catalogs, declared on its manifest. A provider outside its coverage is not consulted at all, however many gaps a record still has and even on an explicit refresh, because a catalogue that does not carry this kind of book answers with the wrong record rather than with nothing. Declaring coverage is reserved for genuinely narrow catalogues: a record no provider covers receives no metadata at all.
_Avoid_: Provider filter, disabled provider, library-type restriction

**Provisional Match**:
An automatic enrichment whose single selected candidate received a Confirmed Catalog Identity Verdict from a Compatible Title that was strongly similar rather than equivalent. Its metadata applies immediately and awaits human confirmation, while a tie between viable candidates is an Unresolved Match and applies nothing; Corroborating Evidence from a compatible author is never provisional on that account alone.
_Avoid_: Weak match, low-confidence match, title-only match

**Unresolved Match**:
A human-facing enrichment lifecycle where Bibliographic Evidence admits multiple equally strong viable interpretations and therefore confirms no candidate. It is stored safely as a no-match decision with explicit ambiguity detail, but it is never presented as “No match”. No candidate metadata is applied; up to two alternatives and their reasons are retained for a human decision, and automatic reconsideration requires changed evidence or Evidence Interpretation. A uniquely stronger Confirmed candidate—such as an equivalent title over a merely similar title—wins without creating an Unresolved Match.
_Avoid_: Provisional Match, automatic best guess, provider failure

**Manual Match Resolution**:
The explicit human selection of one candidate from an Unresolved Match. It confirms and protects the selected catalog identity while allowing later enrichment to fill missing metadata without replacing that identity.
_Avoid_: Automatic retry, provisional match, manual metadata edit

**Deferred Enrichment Retry**:
The non-terminal processing commitment for a catalog record whose Catalog Enrichment Pipeline was interrupted by temporary provider unavailability; its continuation is automatic and constrained by provider availability rather than user action. Only actual provider calls consume its three-attempt retry budget; exhaustion requires human attention.
_Avoid_: Failed match, manual retry, cooldown error

**Provider Quota Scope**:
The set of provider requests that consume the same externally enforced quota and therefore share provider availability and cooldown. It follows the effective credentials and quota-relevant configuration rather than catalog record or organization identity alone.
_Avoid_: Global provider cooldown, per-book cooldown, tenant cooldown

**Catalog Record**:
A stored ebook or audiobook with its own media-specific metadata, relationships, files, and consumption state. An ebook and an audiobook remain distinct Catalog Records even when they contain the same volume.
_Avoid_: Logical Edition, Publication, cross-media book

**Duplicate Copy**:
A Catalog Record judged substitutable with and represented through a canonical Catalog Record of the same media kind. It uses the canonical record's effective catalog relationships and is never grouped across ebook and audiobook media.
_Avoid_: Logical Edition, cross-media duplicate, independent edition

**Media Series**:
An ordered catalog sequence for exactly one media kind whose boundary follows the authoritative provider or an explicit manual edit. Nanahoshi preserves provider umbrella groupings rather than deriving a different subseries from titles, while ebook and audiobook series remain distinct.
_Avoid_: Cross-media series, locally inferred subseries, franchise

**Series Membership**:
The association of a canonical Catalog Record with a Media Series and optional position. Confirmed membership remains valid when its position is unknown; a Duplicate Copy uses its canonical record's effective membership, while ebook and audiobook memberships remain independent.
_Avoid_: File series, provider series, cross-media membership

**Read & Listen Pair**:
A shared, human-confirmed relationship between one ebook Catalog Record and one audiobook Catalog Record whose source files are intended to be synchronized. It is independent of Catalog Identity, and either record may participate in more than one pair.
_Avoid_: Same book, duplicate group, attached ebook, personal pairing

**Read & Listen Session**:
A temporary synchronized consumption experience started from either publication in a Read & Listen Pair. It inherits the initiating publication's progress and has no separate progress or recent-activity identity.
_Avoid_: Read & Listen item, Read & Listen progress, third format

**Alignment Artifact**:
A derived, versioned mapping from addressable ebook text to timed audiobook intervals for one Read & Listen Pair. It identifies the exact source bytes from which it was produced and is replaceable without changing the pair.
_Avoid_: Subtitle file, pairing, transcript

**Alignment Import**:
The admission of an already completed Alignment Artifact into a Read & Listen Pair after its declared ebook and audiobook sources are verified. Nearby-file detection and manual upload are discovery mechanisms for the same import, not distinct alignment operations.
_Avoid_: Find existing alignment, generation, SRT import

**Timed Text Source**:
A timestamped transcript, such as an SRT file, used as input to create an Alignment Artifact. It is not itself an alignment because its timestamps address audio while its text has not yet been mapped to the ebook.
_Avoid_: Alignment file, imported alignment, subtitle alignment

**Alignment Generation**:
The production of a new Alignment Artifact from either a Timed Text Source or transcription of the audiobook. It is distinct from Alignment Import, which admits an artifact that is already complete.
_Avoid_: Alignment detection, SRT import

**Stale Alignment**:
An Alignment Artifact whose recorded source identities no longer describe the current ebook or audiobook files in its Read & Listen Pair. It remains historical evidence but is not valid reader synchronization.
_Avoid_: Failed alignment, low-quality alignment

**Audiobook Quick Match**:
Automatic audiobook metadata selection modeled after Audiobookshelf and applied through Nanahoshi's configured provider chain, whose default order is Audible followed by iTunes. A valid ASIN is resolved directly through Audible when possible; otherwise provider search results are selected from title and optional author queries, with duration used to improve Audible candidate ordering. The first provider with an acceptable result supplies primary metadata, and later providers may fill fields still missing. Narrators and abridged/unabridged status are metadata applied from the selected result rather than identity vetoes. Provider metadata fills missing fields by default, while explicit manual edits remain protected.
_Avoid_: Recording identity proof, duplicate grouping

**Provider Order**:
The per-library ordered list of enabled remote metadata providers, controlling attempt sequence but not which provider may finalize identity or individual fields. Book and audiobook enrichment resolve this configuration before discovery; documented orders are defaults used only when the library has no valid override, while `catalogIdentity` receives provider evidence and never selects, reorders, or configures providers.
_Avoid_: Hard-coded provider chain, identity priority

**Provider Authority**:
The per-library rule selecting the single primary provider that may finalize an automatic match and authoritative metadata fields, including Media Series boundaries. Other enabled providers may contribute only permitted supplemental fields and can never outrank the primary provider or an explicit manual edit.
_Avoid_: Provider Order, fallback order, confidence score

**Metadata Profile**:
A user-selected per-library preset for its primary provider, Provider Order, and supplemental sources by field, describing the library's predominant catalog content without classifying every record. It remains editable and is never inferred solely from filenames or catalog metadata.
_Avoid_: Library type, automatic content detection, hard-coded provider configuration

**Edition Discriminator**:
A typed volume number, numbered part or arc, Structural Part, or Supplemental Release kind that distinguishes related catalog entities. A title may declare several Edition Discriminators simultaneously, and none is discarded to produce a single volume value. Conflicting discriminators of the same type are conclusive even when records share an external identifier.
_Avoid_: Title decoration, metadata noise

**Unnumbered First Volume**:
A catalog entity whose title omits an explicit volume number or numbered-part value. It is equivalent to an explicit volume one or first numbered part when the base title agrees, Corroborating Evidence exists, and no other Edition Discriminator conflicts. This default does not apply to a missing Structural Part.
_Avoid_: Unversioned book

**Structural Part**:
A complementary subdivision of a catalog entity identified by a literal marker such as upper (`上`), middle (`中`), lower (`下`), first (`前`), or latter (`後`) part. Each distinct marker establishes a distinct identity; only graphical forms of the same marker, such as `上`, `上巻`, and `（上）`, are equivalent.
_Avoid_: Version

**Catalog Identity Verdict**:
The symmetric conclusion for one identity level: Confirmed when two records represent the same entity at that level, Rejected when they represent distinct entities, or Indeterminate when the available evidence proves neither. The verdict includes stable reasons identifying the supporting evidence, veto, or unresolved ambiguity; it does not include a ranking score or choose which record supplies canonical metadata.
_Avoid_: Boolean match, similarity score

**Supplemental Release**:
A catalog entity distinguished from a main volume as a fanbook, short-story collection, anthology, side story, drama CD, or omnibus. A Supplemental Release and a main volume, two different kinds of Supplemental Release, or two separately titled releases of the same kind have distinct identities.
_Avoid_: Bonus version, alternate edition

**Content Edition**:
A catalog entity explicitly identified as complete, revised, newly translated, or otherwise changed in textual content. A Content Edition and the corresponding original have distinct identities.
_Avoid_: Packaging variant, store promotion

**Packaging Variant**:
A presentation distinguished only by imprint text, store-exclusive extras, cover or binding presentation, limited/special packaging, or `新装版` without evidence of textual revision. Packaging Variants do not change edition-level Catalog Identity; an explicit revised, expanded, or newly translated marker takes precedence and identifies a Content Edition.
_Avoid_: Content edition, supplemental release

**Corroborating Evidence**:
For written books, independent evidence from a compatible author or matching external identifier that supports a compatible title. A written-book title without Corroborating Evidence leaves the Catalog Identity Verdict Indeterminate, regardless of its length or apparent distinctiveness.
_Avoid_: Distinctive title, confidence by title length

**Authorship Evidence**:
Names explicitly identified as authors of a publication. Compatible Authorship Evidence requires at least one author shared after safe normalization or an explicit alias relationship; additional authors are neutral because sources may be incomplete, while two known sets with no shared author are incompatible. Approximate spelling similarity is only useful for Candidate Ranking. Illustrators, translators, editors, and contributors with an unknown role do not participate in the Catalog Identity Verdict.
_Avoid_: Contributor match, untyped creator

**Edition Language**:
The language of a catalog record's content, independent of the script or language used to represent its title in metadata. Two known, different Edition Languages establish distinct edition-level identities.
_Avoid_: Title language, title script

**Compatible Title**:
A pair of title forms that are equivalent after known normalization or explicit aliases, or strongly similar when supported by Corroborating Evidence. For written books, title similarity without Corroborating Evidence leaves the Catalog Identity Verdict Indeterminate; Audiobook Quick Match follows its separate Audiobookshelf-compatible selection policy.
_Avoid_: Fuzzy match as proof

**Candidate Ranking**:
The ordering of possible catalog matches for discovery, metadata hydration, or manual review. In the unified remote-provider pipeline, a preliminary Catalog Identity Verdict may discard Rejected candidates while allowing viable candidates to be hydrated; a final verdict then determines whether the result may be merged or the caller should continue through Provider Order. Ranking never supplies a written-book identity verdict. Audiobook Quick Match uses title, author, and duration to order results under its Audiobookshelf-compatible policy without claiming proof of a distinct recording identity.
_Avoid_: Identity confidence, match verdict

**Discovery Projection**:
The bounded, provider-independent search forms derived from Bibliographic Evidence through Evidence Interpretation. It keeps the raw form first, removes duplicates, and supplies at most four deterministic queries that providers execute without redefining catalog identity.
_Avoid_: Provider cleanup, unbounded query expansion, identity verdict

**Bibliographic Evidence**:
The uninterpreted, role-preserving title forms, authors, external identifiers, and Edition Language available for a catalog record. The identity domain derives normalized forms and Edition Discriminators from this evidence; sources and callers do not decide their meaning independently. A discriminator declared by one title form and omitted by another remains usable, while contradictory explicit discriminators within one record make its identity evidence indeterminate.
_Avoid_: Precomputed match flags, provider-specific identity

**Evidence Interpretation**:
The provider-independent derivation of normalized title and author forms and Edition Discriminators from Bibliographic Evidence inside Catalog Identity. It may derive slash-separated authors and query-only typographic boundaries, discard recognized packaging noise, and treat repeated title forms as cumulative evidence so no discriminator is lost; it preserves raw source evidence and never reinterprets authoritative Media Series boundaries.
_Avoid_: Provider cleanup, search-term normalization, repaired metadata

**Identifier Evidence**:
A valid identifier associated with a publication and compared only within its identifier scheme. A valid ISBN-10 and its calculated `978` ISBN-13 counterpart are the same Identifier Evidence; ISBNs with a `979` prefix have no ISBN-10 counterpart. Different identifiers are neutral rather than contradictory, and a matching identifier corroborates only a compatible title without an Edition Discriminator conflict.
_Avoid_: Cross-scheme identifier match, identifier veto

**Qualified Embedded Identifier**:
An opaque identifier extracted from a publication that becomes Identifier Evidence only after its format, placeholder patterns, scheme collisions, and reuse frequency within the library have been evaluated. The caller supplies observed library facts; the identity domain applies the qualification policy.
_Avoid_: Raw EPUB UID, globally authoritative identifier
