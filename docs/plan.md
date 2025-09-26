# Chatbot Builder – Implementation Plan

Date: 2025-09-26
Owner: TBD
Status: Draft

This plan operationalizes the client’s feedback (7 items) into epics, user stories, tasks, acceptance criteria, and a staged rollout. Paths below are relative to `src/`.

## Goals and Non‑Goals

Goals
- Add clear sidebar sections for Swift AI, Curriculum Chatbots, and My Chatbots
- Provide curriculum connect popup and pipeline to inject curriculum items into bot knowledge
- Role/type-based visibility for Grading and Session Control
- Live Bot Preview persona auto-run with typing animation and turn limits
- AI-assisted build that also proposes knowledge plus a “Check configuration” review step
- Post-build editing via /chatbot-builder/:id and edit entry points
- Clarify and, if needed, extend rich output rendering

Non‑Goals
- Back-end curriculum data authoring UI (we’ll consume available sources via API or uploads)
- Full LMS integration beyond knowledge import and bot configuration

## Architecture + Data Model Changes

Add fields to chatbot model (API + UI)©
- type: enum { system (Swift AI), curriculum, personal }
- subject: { id, name } or string; optionally course, exam_board, spec_code
- curriculum_links: array of selected spec item IDs or descriptors

Where used
- UI grouping in `lib/components/layout/Sidebar.svelte`
- Builder transforms in `lib/chatbot-builder-stores.js` (transformConfigToApiFormat) and `lib/chatbot-builder-types.js`
- Chat open navigation remains via `/c/{id}?bot=1`

Dependencies
- API endpoints (create/update/list chatbots) must accept/return new fields

## Epics, Stories, Tasks, and Acceptance Criteria

### Epic A: Sidebar Sections (Swift AI, Curriculum, My Chatbots)
User stories
- As a teacher/admin, I see three sections on the left: Swift AI, Curriculum Chatbots, My Chatbots
- As an admin, I can mark bots as system/curriculum/personal and see them grouped accordingly

Tasks
- Update chatbot DTOs to include `type` and optional `subject`
- Extend fetch in `lib/components/layout/Sidebar.svelte` to group bots by type
- Render three sections with counts; keep “Recent Chats” as-is
- Show subject labels for curriculum bots (if present)

Acceptance
- Sidebar shows three groups consistently after refresh
- Clicking a bot navigates to `/c/{id}?bot=1` and opens chat
- My Chatbots continues to have + New and refresh actions

### Epic B: Curriculum Connect (Popup + Knowledge Pipeline)
User stories
- As a teacher, I can open a Curriculum popup to select Board → Subject → Topic → Outcomes
- I can upload a structured CSV/HTML table of learning outcomes
- Selected items are added to the bot’s knowledge base

Tasks
- Add `CurriculumModal.svelte` in `lib/components/chatbot-builder/`
- Hook modal entry from `BehaviorKnowledgeSection.svelte` (button: “Connect curriculum”)
- Map selections to knowledge items in `chatbotConfig` (prefer `knowledgeBase`), surface in UI and pass via save transform
- Add simple import adapter for CSV/HTML table

Acceptance
- Selecting curriculum items populates a visible list in Behavior & Knowledge
- Saving the bot persists curriculum links (IDs or descriptors) and knowledge entries

### Epic C: Visibility Rules for Grading & Session Control
User stories
- As a teacher creating student-facing bots, I don’t see Grading/Session Control if disabled by admin or bot type

Tasks
- Add visibility flags or derive from `type` in `ChatbotBuilderMain.svelte`
- Conditionally render `GradingSection.svelte` and `SessionControlSection.svelte`
- At runtime (chat/preview), obey visibility for student roles (where applicable)

Acceptance
- Switching bot type to “personal/student-facing” hides both sections in builder
- Admin/system bots can still configure these sections

### Epic D: Live Preview – Persona Auto‑Run with Turn Limits
User stories
- As a creator, I can click Start to run an autonomous persona-driven conversation for N turns with a Stop button
- I see typing animation (streamed tokens) for the bot

Tasks
- In `lib/components/chatbot-builder/ChatbotBuilderMain.svelte` and `LiveBotPreview.svelte`:
  - Add Start/Stop controls, max turns selector (e.g., 6, 8, 10)
  - Implement loop: alternate persona/user turns; seed with ephemeral preamble from current config
  - Reuse existing streaming (`sseStream`) and token-append rendering

Acceptance
- Start initiates a conversation without manual typing
- The conversation stops automatically after N turns or on Stop
- Typing animation remains smooth

### Epic E: AI‑Assisted Build – Knowledge + Review Step
User stories
- AI-assisted flow proposes instructions, greeting, starters, and suggested knowledge sources
- I can “Check configuration” before creating, viewing a consolidated summary

Tasks
- Extend `ConversationalAiBuilder.svelte` / `AiAssistedBuilder.svelte` to propose knowledge items
- Add a Review/Check page in `ChatbotBuilderMain.svelte` summarizing all fields with inline “Edit” links back to sections
- Save remains the final step

Acceptance
- AI flow populates knowledge suggestions that can be accepted/removed
- Review page lists name, role, instructions, greeting, starters, capabilities, grading/session, knowledge; Save disabled if invalid

### Epic F: Post‑Build Editing
User stories
- I can edit an existing bot from the list via an Edit action
- Loading `/chatbot-builder/:id` pre-fills the builder with the saved configuration

Tasks
- New route `routes/(authenticated)/chatbot-builder/[id]/+page.svelte`
- Add load logic to hydrate `chatbotConfig` from API on mount
- Add Edit entry in `Sidebar.svelte` chatbot items (menu or icon) linking to builder route

Acceptance
- Visiting `/chatbot-builder/{id}` loads the bot for editing
- “Edit” from sidebar opens the builder with populated data

### Epic G: Output Rendering Clarifications
User stories
- As a user, I understand what rich outputs the bot can render (tables, math, Mermaid diagrams, HTML previews)

Tasks
- Document supported formats in help/tooltip (Markdown tables, KaTeX, Mermaid, manual HTML/SVG preview)
- Confirm `securityLevel: 'loose'` for Mermaid remains acceptable; ensure HTML preview stays manual and sanitized

Acceptance
- Docs available; no regression in Markdown/KaTeX/Mermaid rendering

## Cross‑Cutting Work

- API updates: extend chatbot CRUD to accept/return `type`, `subject`, `curriculum_links`
- Store and transform updates in `lib/chatbot-builder-stores.js` and `lib/chatbot-builder-types.js`
- QA: Unit and integration tests for builder flows and sidebar grouping

## UI Touch Points

- Sidebar: `lib/components/layout/Sidebar.svelte`
- Builder main: `lib/components/chatbot-builder/ChatbotBuilderMain.svelte`
- Sections: BehaviorKnowledgeSection, GradingSection, SessionControlSection, LiveBotPreview, ConversationalAiBuilder
- Chat screen (for runtime visibility if needed): `lib/components/chat/Chat.svelte`

## Testing Strategy

- Unit tests
  - Transform and store logic (chatbot-builder-stores)
  - LiveBotPreview persona loop termination and token handling
- Component tests (Svelte)
  - Sidebar grouping by type
  - Curriculum modal selection and knowledge injection
  - Review step validation and navigation back to sections
- Integration tests
  - Create → Review → Save → Edit flow
  - Autonomous preview run with turn limits

## Metrics of Success
- Time to first bot (median) decreases
- % of bots built via AI-assisted flow increases
- Fewer support requests around grading/session visibility
- Engagement: preview runs per builder session; curriculum items attached per bot

## Risks & Mitigations
- API alignment delay → Mitigation: feature flag UI, local mock transforms
- Curriculum data heterogeneity → Mitigation: CSV/HTML adapters with validation and preview
- Persona auto-run runaway loops → Mitigation: hard turn limit and visible Stop

## Rollout Plan

Phase 0 (Prep)
- API contract finalized for `type`, `subject`, `curriculum_links`

Phase 1 (1–2 weeks)
- Epics A, C, F (core navigation, visibility, editing)

Phase 2 (1–2 weeks)
- Epics B, E (curriculum modal + AI knowledge suggestions + review step)

Phase 3 (1 week)
- Epic D, G (persona auto-run; documentation and rendering clarifications)

## Open Questions
- Curriculum sources: Do we have an internal API for specifications, or start with CSV/HTML uploads only?
- Bot types: Are “Swift AI” bots global for all tenants or per-tenant?
- Subject taxonomy: standardized list vs free text?
- Visibility rules: Should Grading/Session be strictly hidden for student-facing or toggleable per bot?

## Acceptance Checklist (Go/No-Go)
- [ ] Sidebar shows three sections and correct counts
- [ ] Curriculum modal injects items into knowledge and persists them
- [ ] Grading/Session visibility matches bot type/role policy
- [ ] Persona auto-run works with Start/Stop and turn limits
- [ ] AI-assisted build proposes knowledge and includes Review step
- [ ] /chatbot-builder/:id preloads config; Edit entry exists
- [ ] Rendering docs published; Mermaid/Markdown/KaTeX verified

