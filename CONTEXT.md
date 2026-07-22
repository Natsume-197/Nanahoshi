# Nanahoshi Library

Nanahoshi organizes a shared digital library and reconciles catalog records from local files and external sources.

## Language

**Catalog Identity**:
The domain decision that two records describe the same catalog entity. All remote book and audiobook providers use one discovery, ranking, preliminary assessment, hydration, final assessment, and merge pipeline. The record's media kind selects the rules inside `catalogIdentity`: written books compare their Logical Edition using explicit identity evidence, while audiobooks use Audiobook Quick Match with Audiobookshelf-compatible matching semantics rather than attempting to prove a distinct recording identity. Discovery, Candidate Ranking, canonical metadata selection, merging, and persistence remain outside the module.
_Avoid_: Search relevance, metadata similarity

**Catalog Enrichment Pipeline**:
The provider-ordered process that discovers, ranks, preliminarily assesses, hydrates, finally assesses, and merges remote metadata candidates for a catalog record. The record's media kind selects the identity and merge policies, and only a final Confirmed Catalog Identity Verdict permits automatic enrichment.
_Avoid_: Remote Catalog Reconciliation, provider-specific enrichment chain

**Logical Edition**:
The catalog identity shared by records representing the same book volume or supplemental release, even when they come from different files or sources. Different volumes, structural parts, fanbooks, short-story collections, side stories, and omnibuses are distinct Logical Editions.
_Avoid_: Book identity, search match

**Audiobook Quick Match**:
Automatic audiobook metadata selection modeled after Audiobookshelf and applied through Nanahoshi's configured provider chain, whose default order is Audible followed by iTunes. A valid ASIN is resolved directly through Audible when possible; otherwise provider search results are selected from title and optional author queries, with duration used to improve Audible candidate ordering. The first provider with an acceptable result supplies primary metadata, and later providers may fill fields still missing. Narrators and abridged/unabridged status are metadata applied from the selected result rather than identity vetoes. Provider metadata fills missing fields by default, while explicit manual edits remain protected.
_Avoid_: Recording identity proof, duplicate grouping

**Provider Order**:
The per-library ordered list of enabled remote metadata providers. Book and audiobook enrichment resolve this configuration before discovery; documented orders are defaults used only when the library has no valid override. `catalogIdentity` receives provider evidence and never selects, reorders, or configures providers.
_Avoid_: Hard-coded provider chain, identity priority

**Edition Discriminator**:
A typed volume number, numbered part or arc, Structural Part, or Supplemental Release kind that distinguishes related Logical Editions. A title may declare several Edition Discriminators simultaneously, and none is discarded to produce a single volume value. Conflicting discriminators of the same type are conclusive even when records share an external identifier.
_Avoid_: Title decoration, metadata noise

**Unnumbered First Volume**:
A Logical Edition whose title omits an explicit volume number or numbered-part value. It is equivalent to an explicit volume one or first numbered part when the base title agrees, Corroborating Evidence exists, and no other Edition Discriminator conflicts. This default does not apply to a missing Structural Part.
_Avoid_: Unversioned book

**Structural Part**:
A complementary subdivision of a publication identified by a literal marker such as upper (`上`), middle (`中`), lower (`下`), first (`前`), or latter (`後`) part. Each distinct marker identifies a distinct Logical Edition rather than an alternate version; only graphical forms of the same marker, such as `上`, `上巻`, and `（上）`, are equivalent.
_Avoid_: Version

**Catalog Identity Verdict**:
The symmetric conclusion for one identity level: Confirmed when two records represent the same entity at that level, Rejected when they represent distinct entities, or Indeterminate when the available evidence proves neither. The verdict includes stable reasons identifying the supporting evidence, veto, or unresolved ambiguity; it does not include a ranking score or choose which record supplies canonical metadata.
_Avoid_: Boolean match, similarity score

**Supplemental Release**:
A publication distinguished from a main volume as a fanbook, short-story collection, anthology, side story, drama CD, or omnibus. A Supplemental Release and a main volume, two different kinds of Supplemental Release, or two separately titled releases of the same kind are distinct Logical Editions.
_Avoid_: Bonus version, alternate edition

**Content Edition**:
A publication explicitly identified as complete, revised, newly translated, or otherwise changed in textual content. A Content Edition and the corresponding original publication are distinct Logical Editions.
_Avoid_: Packaging variant, store promotion

**Packaging Variant**:
A presentation of the same Logical Edition distinguished only by imprint text, store-exclusive extras, cover or binding presentation, limited/special packaging, or `新装版` without evidence of textual revision. Packaging Variants do not change identity; an explicit revised, expanded, or newly translated marker takes precedence and identifies a Content Edition.
_Avoid_: Content edition, supplemental release

**Corroborating Evidence**:
For written books, independent evidence from a compatible author or matching external identifier that supports a compatible title. A written-book title without Corroborating Evidence leaves the Catalog Identity Verdict Indeterminate, regardless of its length or apparent distinctiveness.
_Avoid_: Distinctive title, confidence by title length

**Authorship Evidence**:
Names explicitly identified as authors of a publication. Compatible Authorship Evidence requires at least one author shared after safe normalization or an explicit alias relationship; additional authors are neutral because sources may be incomplete, while two known sets with no shared author are incompatible. Approximate spelling similarity is only useful for Candidate Ranking. Illustrators, translators, editors, and contributors with an unknown role do not participate in the Catalog Identity Verdict.
_Avoid_: Contributor match, untyped creator

**Edition Language**:
The language of a publication's content, independent of the script or language used to represent its title in metadata. Two known, different Edition Languages identify distinct Logical Editions.
_Avoid_: Title language, title script

**Compatible Title**:
A pair of title forms that are equivalent after known normalization or explicit aliases, or strongly similar when supported by Corroborating Evidence. For written books, title similarity without Corroborating Evidence leaves the Catalog Identity Verdict Indeterminate; Audiobook Quick Match follows its separate Audiobookshelf-compatible selection policy.
_Avoid_: Fuzzy match as proof

**Candidate Ranking**:
The ordering of possible catalog matches for discovery, metadata hydration, or manual review. In the unified remote-provider pipeline, a preliminary Catalog Identity Verdict may discard Rejected candidates while allowing viable candidates to be hydrated; a final verdict then determines whether the result may be merged or the caller should continue through Provider Order. Ranking never supplies a written-book identity verdict. Audiobook Quick Match uses title, author, and duration to order results under its Audiobookshelf-compatible policy without claiming proof of a distinct recording identity.
_Avoid_: Identity confidence, match verdict

**Bibliographic Evidence**:
The uninterpreted, role-preserving title forms, authors, external identifiers, and Edition Language available for a catalog record. The identity domain derives normalized forms and Edition Discriminators from this evidence; sources and callers do not decide their meaning independently. A discriminator declared by one title form and omitted by another remains usable, while contradictory explicit discriminators within one record make its identity evidence indeterminate.
_Avoid_: Precomputed match flags, provider-specific identity

**Identifier Evidence**:
A valid identifier associated with a publication and compared only within its identifier scheme. A valid ISBN-10 and its calculated `978` ISBN-13 counterpart are the same Identifier Evidence; ISBNs with a `979` prefix have no ISBN-10 counterpart. Different identifiers are neutral rather than contradictory, and a matching identifier corroborates only a compatible title without an Edition Discriminator conflict.
_Avoid_: Cross-scheme identifier match, identifier veto

**Qualified Embedded Identifier**:
An opaque identifier extracted from a publication that becomes Identifier Evidence only after its format, placeholder patterns, scheme collisions, and reuse frequency within the library have been evaluated. The caller supplies observed library facts; the identity domain applies the qualification policy.
_Avoid_: Raw EPUB UID, globally authoritative identifier

**Consistent Edition Group**:
A collection of records assigned to one Logical Edition. A record may join when at least one member yields a Confirmed Catalog Identity Verdict and no member yields Rejected; a single Rejected verdict vetoes the automatic merge, while only Indeterminate verdicts leave the record outside the group.
_Avoid_: Transitive match chain, connected-component duplicate group
