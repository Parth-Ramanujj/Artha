# IMPLEMENTATION_PLAN.md — WhatsApp Flow Studio

## Overview
This implementation plan establishes the phase-by-phase execution roadmap to complete the **WhatsApp Flow Studio** (Personal WhatsApp Workflow Studio inspired by n8n). Each phase delivers verified, working slices across frontend, backend, database models, and unit tests.

---

## Phase Breakdown

### Phase 1 — Foundation & Node Catalog Expansion
- [x] **1.1 Architecture & Baseline Inspection**: Document existing architecture, verify TypeORM models, multi-adapter engine, and dashboard state.
- [ ] **1.2 Expand Workflow Enums & Node Definitions**:
  - Add missing node action types to `src/modules/workflow/entities/workflow-definition.entity.ts`:
    - `SET_FIELDS` ('set_fields')
    - `FILTER` ('filter')
    - `STOP_WORKFLOW` ('stop_workflow')
    - `GOOGLE_SHEETS` ('google_sheets')
    - `SEND_MEDIA` ('send_media')
- [ ] **1.3 Frontend Node Palette Catalog & Types**:
  - Update `dashboard/src/components/workflow-builder/types.ts` with `set_fields`, `filter`, `stop_workflow`, `google_sheets`, `send_media`.
  - Add these nodes to `NodePalette.tsx` with searchable icons, descriptions, and default configuration.

### Phase 2 — Core Engine & Node Executors
- [ ] **2.1 Implement New Node Handlers in WorkflowExecutor**:
  - `actionSetFields`: Evaluate variable assignments (`vars[name] = interpolate(val)`) and store in `run.triggerData.capturedVariables`.
  - `actionFilter`: Evaluate boolean conditions against context; if false, stop execution cleanly with `skipped`.
  - `actionStopWorkflow`: Stop the execution gracefully with a user-provided termination reason.
  - `actionGoogleSheets`: Append row or read from Google Sheets endpoint via safe REST/SSRF-guarded call.
  - `actionSendMedia`: Send document/image/audio with URL or base64 and caption.
- [ ] **2.2 Dry-Run Safe Mode**:
  - In `actionSendMessage`, `actionSendTemplate`, `actionSendMedia`, and `actionInteractiveButtons`:
    - If `ctx.metadata?.isTest === true` or `dryRun: true`:
      - Do NOT invoke live WhatsApp engine.
      - Log simulated message dispatch and return `{ sent: true, simulated: true, messageId: 'sim_' + Date.now() }`.
- [ ] **2.3 Variable Token Path Resolution**:
  - Support `{{vars.fieldName}}`, `{{trigger.message}}`, `{{trigger.phone}}`, `{{steps.<id>.data}}`.

### Phase 3 — n8n-Style Canvas UX & Inspector Enhancements
- [ ] **3.1 Custom React Flow Node Components**:
  - Create dedicated custom node components in `dashboard/src/components/workflow-builder/nodes/`:
    - `SetFieldsNode.tsx`
    - `FilterNode.tsx`
    - `StopNode.tsx`
    - `GoogleSheetsNode.tsx`
    - `MediaNode.tsx`
  - Register them in `nodeTypes` map in `VisualWorkflowBuilder.tsx`.
- [ ] **3.2 Inspector Controls for New Nodes**:
  - Add forms and variable selectors in `NodeInspector.tsx` for `set_fields`, `filter`, `stop_workflow`, `google_sheets`, and `send_media`.
  - Provide a clickable variable picker token insert helper (`{{trigger.phone}}`, `{{trigger.message}}`, etc.) next to text inputs.
- [ ] **3.3 Canvas Enhancements**:
  - Add edge branch labels (`True`/`False` for branches, option names for buttons).
  - Add Dry-Run toggle button in top toolbar with visual badge.

### Phase 4 — Pre-Built Workflow Templates
- [ ] **4.1 Curate Production Starter Presets in `WorkflowPresets.ts`**:
  - `Auto-Reply Outside Business Hours` (Working hours condition -> WhatsApp reply).
  - `Lead Qualification & Google Sheets Sync` (Interactive menu -> Question capture -> Google Sheets append -> Confirmation).
  - `AI Customer Support & Smart Handoff` (AI classifier -> RAG reply -> Low confidence Handoff).
  - `Keyword-Triggered Order / Invoice Tracker` (Keyword match -> Webhook API lookup -> Reply template).
- [ ] **4.2 Template Modal Selection & Import**:
  - Ensure presets can be instantly applied to the canvas with auto-layout and saved to backend.

### Phase 5 — Reliability, Verification & Tests
- [ ] **5.1 Backend Automated Unit Tests**:
  - Update `src/modules/workflow/workflow-executor.service.spec.ts` to test all new nodes (`set_fields`, `filter`, `stop_workflow`, `dry_run`, variable interpolation).
  - Verify all test suites pass with Jest.
- [ ] **5.2 Frontend & Backend Clean Builds**:
  - Run `npm run dashboard:build` (`tsc -b && vite build`) -> zero errors.
  - Run `npm run build` (`nest build`) -> zero errors.
- [ ] **5.3 Git Sync & Documentation**:
  - Commit verified changes and push to `https://github.com/Parth-Ramanujj/Artha.git`.
  - Provide comprehensive final report to user.
