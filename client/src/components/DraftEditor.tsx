import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Pencil, Mic, MicOff, Send, Check, Loader2, Tag, X,
  ArrowRight, RotateCcw, DollarSign, Plus
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  useUpdateDraft, useRefineDraft, useVoiceRefine, useApproveDraft,
  useTagSuggestions,
  type DraftData, type CanonicalTag
} from "@/hooks/use-projects";
import { useToast } from "@/hooks/use-toast";

type EditMode = "view" | "type" | "voice";

const PRICING_LABELS: Record<string, string> = {
  free: "Free",
  subscription: "Subscription",
  "one-time": "One-time",
  mixed: "Freemium",
};

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

// Tag input component with autocomplete from canonical vocabulary
function TagInput({
  tags,
  onAdd,
  onRemove,
}: {
  tags: string[];
  onAdd: (tag: string) => void;
  onRemove: (tag: string) => void;
}) {
  const [input, setInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const debouncedInput = useDebounce(input, 200);
  const { data: suggestions } = useTagSuggestions(debouncedInput);

  // Filter out tags that are already added
  const filteredSuggestions = (suggestions || []).filter(
    (s) => !tags.some((t) => t.toLowerCase() === s.name.toLowerCase() || t.toLowerCase() === s.slug)
  );

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const addTag = (value: string) => {
    const trimmed = value.trim();
    if (trimmed && !tags.some((t) => t.toLowerCase() === trimmed.toLowerCase())) {
      onAdd(trimmed);
    }
    setInput("");
    setShowSuggestions(false);
    setSelectedIndex(0);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (filteredSuggestions.length > 0 && showSuggestions) {
        addTag(filteredSuggestions[selectedIndex]?.name || input);
      } else if (input.trim()) {
        addTag(input);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, filteredSuggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    } else if (e.key === "Backspace" && !input && tags.length > 0) {
      onRemove(tags[tags.length - 1]);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="flex flex-wrap gap-1.5 mb-1.5">
        {tags.map((tag) => (
          <Badge key={tag} variant="secondary" className="text-xs rounded-md gap-1">
            <Tag className="w-2.5 h-2.5" />
            {tag}
            <button onClick={() => onRemove(tag)} className="ml-0.5 hover:text-destructive">
              <X className="w-2.5 h-2.5" />
            </button>
          </Badge>
        ))}
      </div>
      <div className="relative">
        <Input
          ref={inputRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setShowSuggestions(true);
            setSelectedIndex(0);
          }}
          onFocus={() => input.trim() && setShowSuggestions(true)}
          onKeyDown={handleKeyDown}
          placeholder={tags.length > 0 ? "Add more tags..." : "Type to search tags..."}
          className="h-8 text-xs"
        />
        {/* Suggestions dropdown */}
        <AnimatePresence>
          {showSuggestions && input.trim() && filteredSuggestions.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg overflow-hidden"
            >
              {filteredSuggestions.slice(0, 8).map((tag, i) => (
                <button
                  key={tag.id}
                  onClick={() => addTag(tag.name)}
                  className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors ${
                    i === selectedIndex ? "bg-accent text-accent-foreground" : "hover:bg-muted"
                  }`}
                >
                  <Tag className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                  <span className="font-medium">{tag.name}</span>
                  {tag.usageCount > 0 && (
                    <span className="ml-auto text-[10px] text-muted-foreground">{tag.usageCount} uses</span>
                  )}
                </button>
              ))}
              {input.trim() && !filteredSuggestions.some((s) => s.slug === input.trim().toLowerCase().replace(/[-_]/g, " ")) && (
                <button
                  onClick={() => addTag(input.trim())}
                  className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 border-t border-border hover:bg-muted transition-colors"
                >
                  <Plus className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                  <span>Create &quot;{input.trim()}&quot;</span>
                </button>
              )}
            </motion.div>
          )}
          {showSuggestions && input.trim() && filteredSuggestions.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg overflow-hidden"
            >
              <button
                onClick={() => addTag(input.trim())}
                className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-muted transition-colors"
              >
                <Plus className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                <span>Create &quot;{input.trim()}&quot;</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {tags.length === 0 && !input && (
        <span className="text-[10px] text-muted-foreground">No tags detected</span>
      )}
    </div>
  );
}

export function DraftEditor({
  jobId,
  projectId,
  initialDraft,
}: {
  jobId: number;
  projectId: number;
  initialDraft: DraftData;
}) {
  const [, navigate] = useLocation();
  const [draft, setDraft] = useState<DraftData>(initialDraft);
  const [editMode, setEditMode] = useState<EditMode>("view");
  const [feedback, setFeedback] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const { toast } = useToast();

  const updateDraft = useUpdateDraft();
  const refineDraft = useRefineDraft();
  const voiceRefine = useVoiceRefine();
  const approveDraft = useApproveDraft();

  const isProcessing = updateDraft.isPending || refineDraft.isPending || voiceRefine.isPending;

  // Direct field edit
  const handleFieldUpdate = useCallback(async (updates: Partial<DraftData>) => {
    try {
      const result = await updateDraft.mutateAsync({ jobId, updates });
      setDraft(result);
    } catch (err: any) {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    }
  }, [jobId, updateDraft, toast]);

  // Text feedback refinement
  const handleRefine = useCallback(async () => {
    if (!feedback.trim()) return;
    try {
      const result = await refineDraft.mutateAsync({ jobId, feedback });
      setDraft(result);
      setFeedback("");
      setTranscript(null);
      toast({ title: "Draft updated", description: "Your feedback has been applied." });
    } catch (err: any) {
      toast({ title: "Refinement failed", description: err.message, variant: "destructive" });
    }
  }, [jobId, feedback, refineDraft, toast]);

  // Voice recording
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (blob.size < 100) {
          toast({ title: "Recording too short", description: "Hold the mic button longer.", variant: "destructive" });
          return;
        }
        try {
          const result = await voiceRefine.mutateAsync({ jobId, audioBlob: blob });
          setDraft(result.draft);
          setTranscript(result.transcript);
          toast({ title: "Voice applied", description: `Heard: "${result.transcript}"` });
        } catch (err: any) {
          toast({ title: "Voice processing failed", description: err.message, variant: "destructive" });
        }
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch (err) {
      toast({ title: "Microphone access denied", description: "Allow mic access in your browser.", variant: "destructive" });
    }
  }, [jobId, voiceRefine, toast]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  // Approve and publish
  const handleApprove = useCallback(async () => {
    try {
      const result = await approveDraft.mutateAsync(jobId);
      toast({ title: "Published!", description: "Your project is now live." });
      navigate(`/project/${projectId}`);
    } catch (err: any) {
      toast({ title: "Publish failed", description: err.message, variant: "destructive" });
    }
  }, [jobId, projectId, approveDraft, navigate, toast]);

  const removeTag = (tag: string) => {
    const newTags = draft.tags.filter(t => t !== tag);
    setDraft({ ...draft, tags: newTags });
    handleFieldUpdate({ tags: newTags });
  };

  const addTag = (tag: string) => {
    if (draft.tags.length >= 10) {
      toast({ title: "Tag limit", description: "Maximum 10 tags per project.", variant: "destructive" });
      return;
    }
    const newTags = [...draft.tags, tag];
    setDraft({ ...draft, tags: newTags });
    handleFieldUpdate({ tags: newTags });
  };

  return (
    <div className="space-y-4">
      {/* Draft preview card */}
      <Card className="glass-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Draft Preview</h3>
          <div className="flex items-center gap-1">
            <Button
              variant={editMode === "type" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => setEditMode(editMode === "type" ? "view" : "type")}
            >
              <Pencil className="w-3 h-3" />
              Edit
            </Button>
            <Button
              variant={editMode === "voice" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => setEditMode(editMode === "voice" ? "view" : "voice")}
            >
              <Mic className="w-3 h-3" />
              Voice
            </Button>
          </div>
        </div>

        {/* Name */}
        <div className="space-y-1">
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Name</label>
          {editMode === "type" ? (
            <Input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              onBlur={() => handleFieldUpdate({ name: draft.name })}
              className="h-9 text-lg font-bold"
            />
          ) : (
            <div className="text-lg font-bold">{draft.name || "Untitled"}</div>
          )}
        </div>

        {/* Description */}
        <div className="space-y-1">
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Description</label>
          {editMode === "type" ? (
            <Textarea
              value={draft.shortDescription}
              onChange={(e) => setDraft({ ...draft, shortDescription: e.target.value })}
              onBlur={() => handleFieldUpdate({ shortDescription: draft.shortDescription })}
              className="text-sm resize-none"
              rows={3}
              maxLength={300}
            />
          ) : (
            <p className="text-sm text-muted-foreground">{draft.shortDescription || "No description yet."}</p>
          )}
        </div>

        {/* Tags */}
        <div className="space-y-1">
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Tags</label>
          {editMode === "type" ? (
            <TagInput
              tags={draft.tags}
              onAdd={addTag}
              onRemove={removeTag}
            />
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {draft.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs rounded-md gap-1">
                  <Tag className="w-2.5 h-2.5" />
                  {tag}
                </Badge>
              ))}
              {draft.tags.length === 0 && (
                <span className="text-xs text-muted-foreground">No tags detected</span>
              )}
            </div>
          )}
        </div>

        {/* Pricing + Categories row */}
        <div className="flex gap-4">
          <div className="space-y-1">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Pricing</label>
            <div className="flex items-center gap-1 text-sm">
              <DollarSign className="w-3.5 h-3.5 text-muted-foreground" />
              {PRICING_LABELS[draft.pricingModel] || draft.pricingModel}
              {draft.pricingDetails && (
                <span className="text-muted-foreground">({draft.pricingDetails})</span>
              )}
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Categories</label>
            <div className="flex gap-1">
              {draft.suggestedCategories.map((cat) => (
                <Badge key={cat} variant="outline" className="text-xs rounded-md">{cat}</Badge>
              ))}
            </div>
          </div>
        </div>

        {/* Links */}
        {(draft.demoUrl || draft.docsUrl || draft.repoUrl) && (
          <div className="space-y-1">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Links</label>
            <div className="flex flex-wrap gap-2 text-xs">
              {draft.demoUrl && <a href={draft.demoUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground underline">Demo</a>}
              {draft.docsUrl && <a href={draft.docsUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground underline">Docs</a>}
              {draft.repoUrl && <a href={draft.repoUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground underline">Repo</a>}
            </div>
          </div>
        )}
      </Card>

      {/* Voice editing panel */}
      <AnimatePresence>
        {editMode === "voice" && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            <Card className="glass-card p-5 space-y-3">
              <div className="text-center space-y-2">
                <p className="text-sm font-medium">
                  {isRecording ? "Listening..." : "Tell us what to change"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {isRecording
                    ? "Speak your feedback, then tap stop"
                    : "\"Call it MyApp, add tag AI, describe it as a tool for developers\""}
                </p>
              </div>

              <div className="flex justify-center">
                <button
                  onClick={isRecording ? stopRecording : startRecording}
                  disabled={voiceRefine.isPending}
                  className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${
                    isRecording
                      ? "bg-destructive text-destructive-foreground animate-pulse"
                      : voiceRefine.isPending
                        ? "bg-muted"
                        : "bg-foreground text-background hover:opacity-90"
                  }`}
                >
                  {voiceRefine.isPending ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  ) : isRecording ? (
                    <MicOff className="w-6 h-6" />
                  ) : (
                    <Mic className="w-6 h-6" />
                  )}
                </button>
              </div>

              {transcript && (
                <div className="bg-muted rounded-lg p-3">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Heard</p>
                  <p className="text-sm italic">"{transcript}"</p>
                </div>
              )}
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Text feedback input (always visible as alternative) */}
      <Card className="glass-card p-4">
        <div className="flex gap-2">
          <Input
            placeholder="Type feedback: &quot;rename to MyApp&quot;, &quot;add tag react&quot;, &quot;it's a SaaS for developers&quot;..."
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleRefine(); } }}
            className="h-9 text-sm"
            disabled={isProcessing}
          />
          <Button
            size="sm"
            className="h-9 gap-1"
            onClick={handleRefine}
            disabled={!feedback.trim() || isProcessing}
          >
            {refineDraft.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Refine
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5">
          Or use the voice button above to speak your changes
        </p>
      </Card>

      {/* Approve / Publish */}
      <div className="flex gap-2">
        <Button
          size="lg"
          className="flex-1 h-12 group"
          onClick={handleApprove}
          disabled={approveDraft.isPending}
        >
          {approveDraft.isPending ? (
            <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Publishing...</>
          ) : (
            <>
              <Check className="w-4 h-4 mr-2" />
              Approve & Publish
              <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
