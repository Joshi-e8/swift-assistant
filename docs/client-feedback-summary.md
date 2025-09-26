# Chatbot Builder – Client Feedback Analysis Summary

Date: 2025-09-26

This document maps the client’s 7 feedback points to the current implementation, identifies gaps, and proposes concrete next steps. File paths below are within `src/` unless otherwise noted.

## 1) Layout & Menu Structure

Requested
- Add 3 sections in the left-hand menu:
  - Swift AI (global bots for all users)
  - Curriculum Chatbots (admin-created, filtered by the teacher’s selected course/subject)
  - My Chatbots (teacher-created)

Current
- Sidebar component: `lib/components/layout/Sidebar.svelte`
  - Has a "My Chatbots" list already populated from the API (`getChatbots`) and a "Recent Chats" section.
  - No distinct sections for "Swift AI" or "Curriculum Chatbots".
  - Lists chatbots and navigates to chat via `/c/{chatbotId}?bot=1`.

Gaps
- No taxonomy/metadata on bots to distinguish “Swift AI” vs “Curriculum Chatbots” vs “My Chatbots” beyond ownership.
- No subject/learning-area categorization for “Curriculum” filtering.

Recommendation
- Add type/category to chatbot model (e.g., enum: `system`, `curriculum`, `personal`).
- Add subject metadata for curriculum bots (e.g., subject, course, exam board, spec code, etc.).
- Update Sidebar to render three grouped sections using the new metadata.
- Add Admin-only UI to set bot type and curriculum metadata when creating/editing a bot.

References
- Sidebar structure and chatbots section: `lib/components/layout/Sidebar.svelte` (search for “My Chatbots”, `loadChatbots`).

## 2) Behaviour & Knowledge Setup (Curriculum link)

Requested
- Curriculum link popup to select specification items or upload structured learning outcomes/spec tables; selections are injected into chatbot knowledge.

Current
- Behavior & Knowledge (manual) UI: `lib/components/chatbot-builder/BehaviorKnowledgeSection.svelte`
  - Supports instructions, starters, and uploading "knowledge" files (`knowledgeFiles`).
- There is a `curriculumSelected` flag in the default builder config (`lib/chatbot-builder-types.js`) but no UI to connect/specify curriculum sources.
- No curriculum selection modal or import pipeline.

Gaps
- Missing “Curriculum connect” popup and associated data model.
- No pipeline to map selected curriculum items into knowledge base entries.

Recommendation
- Add a Curriculum modal (popup) that lets teachers select:
  - Board → Subject → Topic → Outcome/Spec item(s)
  - Or upload a structured CSV/HTML table.
- On confirm, transform selections into knowledge items (documents or structured KB entries) and push into builder config (`knowledgeBase` or a curriculum-specific store) and/or upload via backend if available.
- Persist links/IDs to enable updates if curriculum changes.

References
- Manual knowledge inputs: `lib/components/chatbot-builder/BehaviorKnowledgeSection.svelte`
- Default config: `lib/chatbot-builder-types.js` (has `curriculumSelected`, `knowledgeBase`).

## 3) Grading & Session Control visibility

Requested
- Hide grading and session control from teacher-facing bots (used by students).

Current
- Components exist:
  - Grading: `lib/components/chatbot-builder/GradingSection.svelte`
  - Session Control: `lib/components/chatbot-builder/SessionControlSection.svelte`
- No role-/type-based gating logic.

Gaps
- No conditional visibility based on bot type or viewer role.

Recommendation
- Introduce bot visibility config flags (e.g., `showGrading`, `showSessionControls`) or derive from bot type.
- Use `$user.role`/permissions (from `lib/stores`) and bot type to hide these sections in:
  - Builder UI (when editing a “student” bot)
  - Runtime UI (inside chat or preview).

## 4) LiveBot Preview & AI Personas

Requested
- Personas should run autonomous two-way chats (no typing by the creator) with a Start button and turn limits.
- Enable typing animation for responses.

Current
- Live preview component: `lib/components/chatbot-builder/LiveBotPreview.svelte`
  - Supports Manual Test and AI Persona Test tabs.
  - Persona value is passed to streaming endpoint.
  - Typing animation is present via token streaming (appends chunks to the bot message).
- No “Start” persona-run button; preview expects a user message to begin.
- No autonomous two-way loop or turn limit.

Gaps
- No persona-driven autonomous conversation engine.
- No run/stop controls and turn counters.

Recommendation
- Add controls: Start, Stop, Max turns (e.g., 6–10), and optional pace (delay between messages).
- Implement a loop that alternates persona-generated “user” and “bot” turns using backend or a local composition:
  - Seed with a system prompt encoding persona and the current bot config.
  - Stream tokens as now for typing effect.
- Ensure clear termination after N turns or Stop click.

## 5) AI‑Assisted Build Flow

Requested
- AI-assisted build should auto-fill instructions, greeting, starters, knowledge base.
- Add a “Check configuration” step before final creation.

Current
- AI flow: `lib/components/chatbot-builder/ConversationalAiBuilder.svelte` and `AiAssistedBuilder.svelte`
  - Generates instructions, greeting, starters, capabilities.
  - Does not currently auto-propose knowledge ingestion (beyond manual uploads in the behavior section).
- No explicit “Check configuration” step; current flow jumps to save after the last section.

Gaps
- Missing knowledge base suggestions from AI flow.
- Missing explicit review/confirm step with a consolidated summary.

Recommendation
- Extend AI flow to propose relevant knowledge sources (e.g., curriculum items selected in step 2, or AI-suggested reference packs) and pre-populate `knowledgeBase`.
- Add a “Review & Check configuration” page to list all finalized fields (instructions, greeting, starters, capabilities, grading/session settings) with edit-in-place or “Back to section” anchors before Save.

## 6) Post‑Build Editing

Requested
- A clear edit option so teachers can re-enter and adjust behavior, knowledge, and configuration after a bot has been built.

Current
- Builder route: `/chatbot-builder` (page: `routes/(authenticated)/chatbot-builder/+page.svelte`)
- After Save, the builder store keeps the created id; Live Preview can fetch the saved bot if the store still holds it.
- “My Chatbots” sidebar opens chat with the bot, not the builder.

Gaps
- No route like `/chatbot-builder/:id` to pre-load a bot for editing.
- No “Edit” action in chatbot lists/cards.

Recommendation
- Add a parameterized builder route: `/chatbot-builder/[id]`.
- On mount, load bot config via API and hydrate builder stores.
- Add “Edit” button in “My Chatbots” list to navigate to the builder with the id.

## 7) Output Display & Rendering (graphs, tables, diagrams)

Requested
- Clarify constraints for rendering rich responses (HTML, Markdown, tables, diagrams, embedded plots).

Current
- Markdown rendering (with tables) via `marked` + custom extensions: `lib/components/chat/Messages/Markdown.svelte`, `lib/utils/marked/*`.
- KaTeX math support (`katex-extension.ts`).
- Mermaid diagrams supported dynamically in code blocks: `lib/components/chat/Messages/CodeBlock.svelte` (auto-render if ```mermaid code block is present; pan/zoom via `SVGPanZoom`).
- HTML/SVG preview: Code blocks can be previewed (manual action) for `html`/`svg` languages; not auto-rendered in-line by default.
- Security: Mermaid is initialized with `securityLevel: 'loose'` (acceptable for diagrams; consider review if untrusted input). No arbitrary iframe/JS execution.

Constraints/Notes
- Markdown tables, Mermaid diagrams, and math are supported.
- Arbitrary embedded iframes/scripts are not auto-run; HTML preview is a user-initiated action in code blocks.
- For "embedded plots": supported if returned as images or rendered via HTML code block preview; no built-in plotting library integration yet.

## Additional Observations
- Sidebar already includes a “Chatbot Builder” entry and a compact “My Chatbots” list with avatars/roles and a “+ New” button.
- Live preview uses streaming for typing animation and supports light capability toggles (web search, file/image upload, image creation, drawing tools, canvas edit) as badges/toggles. Good base to build persona auto-run on.

## Proposed Next Steps (Implementation Plan)

1) Data model and API alignment (types + subject metadata)
- Add chatbot `type` (system/Swift AI, curriculum, personal) and `subject` fields.
- Update create/update/list API and the builder config transforms.

2) Sidebar sections
- Render three groups (Swift AI, Curriculum Chatbots, My Chatbots) using new fields.
- Filter Curriculum by teacher’s selected course/subject (source from homepage selection; pass via store or route param).

3) Curriculum connect popup and pipeline
- Implement modal for curriculum selection/upload.
- Transform selected items to knowledge entries and attach to builder config (and/or backend KB records).

4) Role-/type-based visibility
- Gate Grading and Session Control sections in the builder and runtime based on bot type and/or user role ($user.role, permissions).

5) AI-assisted knowledge population + Review step
- Extend AI flow to suggest knowledge packs.
- Add “Check configuration” review screen prior to Save.

6) Post-build editing
- Add route `/chatbot-builder/[id]` and preload logic.
- Add “Edit” actions from chatbot lists.

7) Live preview persona auto-run
- Add Start/Stop with turn limits and a simple loop to alternate messages (token streaming preserved for typing effect).

8) Rendering hardening
- Review Mermaid security settings; ensure sanitized HTML preview; document supported formats for teachers.

---

If you want, I can turn this plan into a set of tracked tasks and start implementing the smallest vertical slice (e.g., Sidebar sections + type field end-to-end) in a branch.

