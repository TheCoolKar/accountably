"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Dialog } from "radix-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  GOAL_DESCRIPTION_MAX,
  GOAL_TITLE_MAX,
  GOAL_UNIT_MAX,
  validateGoalDraft,
  type GoalDraft,
  type GoalField,
  type GoalInput,
} from "@/lib/domain/goal";
import type { Goal } from "@/lib/domain/types";
import { Segmented } from "./bits";

function draftFrom(goal: Goal | null): GoalDraft {
  return {
    title: goal?.title ?? "",
    description: goal?.description ?? "",
    goalType: goal?.goalType ?? "one_time",
    targetCount: goal && goal.goalType === "counted" ? String(goal.targetCount) : "",
    unitLabel: goal?.unitLabel ?? "",
  };
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-sm text-destructive">
      {message}
    </p>
  );
}

/**
 * The height of the part of the screen that is actually visible. On a phone
 * that is the space above the keyboard, so the editor can end exactly there
 * and scroll inside itself instead of the page jumping around.
 */
function useVisibleHeight(): number | null {
  const [height, setHeight] = useState<number | null>(null);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => setHeight(Math.round(viewport.height));
    update();
    viewport.addEventListener("resize", update);
    return () => viewport.removeEventListener("resize", update);
  }, []);
  return height;
}

function EditorForm({
  formId,
  goal,
  weekLabel,
  busy,
  setBusy,
  titleRef,
  onSave,
  onDelete,
}: {
  formId: string;
  goal: Goal | null;
  weekLabel: string;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  titleRef: React.RefObject<HTMLInputElement | null>;
  onSave: (input: GoalInput) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<GoalDraft>(() => draftFrom(goal));
  const [errors, setErrors] = useState<Partial<Record<GoalField, string>>>({});
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const set = <K extends keyof GoalDraft>(key: K, value: GoalDraft[K]) =>
    setDraft((previous) => ({ ...previous, [key]: value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    const result = validateGoalDraft(draft);
    if (!result.ok) {
      setErrors(result.errors);
      if (result.errors.title) titleRef.current?.focus();
      return;
    }
    setErrors({});
    setBusy(true);
    // The editor closes on success; on failure it stays open with the text intact.
    await onSave(result.value);
    setBusy(false);
  }

  async function confirmDelete() {
    setBusy(true);
    await onDelete();
    setBusy(false);
  }

  return (
    <form
      id={formId}
      onSubmit={submit}
      noValidate
      // Scrolls inside itself; the page behind never moves.
      className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 pt-1 pb-5"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="goal-title">Goal</Label>
        <Input
          ref={titleRef}
          id="goal-title"
          className="h-12"
          value={draft.title}
          maxLength={GOAL_TITLE_MAX}
          onChange={(event) => set("title", event.target.value)}
          placeholder="What are you committing to?"
          aria-invalid={Boolean(errors.title)}
          aria-describedby={errors.title ? "goal-title-error" : undefined}
          autoComplete="off"
          autoCapitalize="sentences"
          enterKeyHint="done"
        />
        <FieldError id="goal-title-error" message={errors.title} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>How do you track it?</Label>
        <Segmented
          label="Goal type"
          value={draft.goalType}
          onChange={(value) => set("goalType", value)}
          options={[
            { value: "one_time", label: "Done or not" },
            { value: "counted", label: "Count it" },
          ]}
        />
      </div>

      {draft.goalType === "counted" && (
        <div className="grid grid-cols-[5.5rem_1fr] gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="goal-target">Times</Label>
            <Input
              id="goal-target"
              className="h-12 text-center tabular-nums"
              inputMode="numeric"
              pattern="[0-9]*"
              value={draft.targetCount}
              onChange={(event) => set("targetCount", event.target.value)}
              placeholder="3"
              enterKeyHint="done"
              aria-invalid={Boolean(errors.targetCount)}
              aria-describedby={errors.targetCount ? "goal-target-error" : undefined}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="goal-unit">
              Of what <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="goal-unit"
              className="h-12"
              value={draft.unitLabel}
              maxLength={GOAL_UNIT_MAX}
              onChange={(event) => set("unitLabel", event.target.value)}
              placeholder="sessions"
              autoComplete="off"
              autoCapitalize="none"
              enterKeyHint="done"
              aria-invalid={Boolean(errors.unitLabel)}
            />
          </div>
          <div className="col-span-2 empty:hidden">
            <FieldError id="goal-target-error" message={errors.targetCount ?? errors.unitLabel} />
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="goal-description">
          Notes <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Textarea
          id="goal-description"
          rows={2}
          value={draft.description}
          maxLength={GOAL_DESCRIPTION_MAX}
          onChange={(event) => set("description", event.target.value)}
          aria-invalid={Boolean(errors.description)}
        />
        <FieldError id="goal-description-error" message={errors.description} />
      </div>

      <p className="text-sm text-muted-foreground">
        For the week of {weekLabel}. Your squad sees it as soon as you save.
      </p>

      {goal &&
        (confirmingDelete ? (
          <div className="flex flex-col gap-2 rounded-xl border p-3">
            <p className="text-sm">Remove this goal? Your squad will see that you removed it.</p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                size="touch"
                disabled={busy}
                onClick={() => setConfirmingDelete(false)}
              >
                Keep it
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="touch"
                disabled={busy}
                onClick={confirmDelete}
              >
                Remove
              </Button>
            </div>
          </div>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="touch"
            className="text-destructive"
            onClick={() => setConfirmingDelete(true)}
          >
            Remove goal
          </Button>
        ))}
    </form>
  );
}

/**
 * Add or edit a goal. The panel hangs from the top of the screen with Save in
 * its header, so on a phone the field being typed in and the Save button both
 * stay above the keyboard, and nothing scrolls out from under your thumbs.
 */
export function GoalEditor({
  open,
  onOpenChange,
  goal,
  weekLabel,
  onSave,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The goal being edited, or null when adding a new one. */
  goal: Goal | null;
  weekLabel: string;
  onSave: (input: GoalInput) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
}) {
  const formId = useId();
  const titleRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const visibleHeight = useVisibleHeight();

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/35 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-describedby={undefined}
          style={{ maxHeight: visibleHeight ? `${visibleHeight}px` : "100dvh" }}
          className="fixed inset-x-0 top-0 z-50 mx-auto flex w-full max-w-md flex-col rounded-b-3xl bg-background pt-[env(safe-area-inset-top)] shadow-xl outline-none duration-200 data-[state=open]:animate-in data-[state=open]:slide-in-from-top"
          onOpenAutoFocus={(event) => {
            // A new goal starts with the keyboard up, ready to type. When
            // editing, wait for a tap: the person may only want to remove it.
            event.preventDefault();
            if (goal) (event.currentTarget as HTMLElement).focus();
            else titleRef.current?.focus();
          }}
        >
          <div className="flex items-center justify-between gap-2 px-2 py-2">
            <Dialog.Close asChild>
              <Button type="button" variant="ghost" size="touch" className="px-3 font-medium">
                Cancel
              </Button>
            </Dialog.Close>
            <Dialog.Title className="font-heading text-lg font-bold">
              {goal ? "Edit goal" : "New goal"}
            </Dialog.Title>
            <Button type="submit" form={formId} size="touch" className="px-4" disabled={busy}>
              {busy ? "Saving…" : goal ? "Save" : "Add"}
            </Button>
          </div>
          {/* The panel unmounts when closed, so each open starts from the saved values. */}
          <EditorForm
            key={goal?.id ?? "new"}
            formId={formId}
            goal={goal}
            weekLabel={weekLabel}
            busy={busy}
            setBusy={setBusy}
            titleRef={titleRef}
            onSave={onSave}
            onDelete={onDelete}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
