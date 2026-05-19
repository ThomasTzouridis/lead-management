"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { UploadState } from "@/app/page";

type Props = {
  state: UploadState;
  onUpdate: (partial: Partial<UploadState>) => void;
  onNext: () => void;
};

type Client = { id: string; name: string; slug: string };

type ContextMenuState = { client: Client; x: number; y: number };

export function StepClient({ state, onUpdate, onNext }: Props) {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, slug")
        .order("name");
      if (cancelled) return;
      if (error) {
        toast.error("Failed to load clients");
      }
      setClients(data || []);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!contextMenu) return;
    const onMouseDown = (e: MouseEvent) => {
      if (contextMenuRef.current?.contains(e.target as Node)) return;
      setContextMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContextMenu(null);
    };
    const onScroll = () => setContextMenu(null);
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [contextMenu]);

  async function deleteClient(client: Client) {
    setContextMenu(null);
    const confirmed = window.confirm(
      `Delete client "${client.name}"?\n\nThis will also delete all leads and upload batches belonging to this client. This cannot be undone.`
    );
    if (!confirmed) return;

    setDeletingId(client.id);
    const { error } = await supabase.from("clients").delete().eq("id", client.id);
    setDeletingId(null);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(`Deleted "${client.name}"`);
    setClients((prev) => prev.filter((c) => c.id !== client.id));
    if (state.clientId === client.id) {
      onUpdate({ clientId: "", clientName: "" });
    }
  }

  async function createClient() {
    if (creating) return; // prevent double-submit
    if (!newName.trim()) return;
    setCreating(true);

    const slug = newName
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // strip diacritics (ü→u, é→e)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    if (!slug) {
      toast.error("Client name must contain at least one letter or number");
      setCreating(false);
      return;
    }

    const { data, error } = await supabase
      .from("clients")
      .insert({ name: newName.trim(), slug })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        toast.error("A client with this name already exists");
      } else {
        toast.error(error.message);
      }
      setCreating(false);
      return;
    }

    toast.success(`Client "${newName.trim()}" created`);
    onUpdate({ clientId: data.id, clientName: data.name });
    setNewName("");
    setCreating(false);

    // Reload list
    const { data: refreshed } = await supabase
      .from("clients")
      .select("id, name, slug")
      .order("name");
    if (refreshed) setClients(refreshed);
  }

  function handleSelect(clientId: string) {
    const client = clients.find((c) => c.id === clientId);
    if (client) {
      onUpdate({ clientId: client.id, clientName: client.name });
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Step 1: Select Client</h2>
        <p className="text-sm text-muted-foreground">
          Choose which client this CSV upload is for.
        </p>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading clients...</p>
      ) : (
        <div className="space-y-4">
          <div>
            <Label>Client</Label>
            <Select
              value={state.clientId || undefined}
              onValueChange={(v) => v && handleSelect(v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a client...">
                  {state.clientName ||
                    clients.find((c) => c.id === state.clientId)?.name}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem
                    key={c.id}
                    value={c.id}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setContextMenu({ client: c, x: e.clientX, y: e.clientY });
                    }}
                  >
                    {c.name}
                    {deletingId === c.id && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        deleting...
                      </span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">or create new</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New client name..."
              className="flex-1 rounded-lg border border-input bg-transparent px-3 py-2 text-sm"
              onKeyDown={(e) => e.key === "Enter" && createClient()}
            />
            <Button
              onClick={createClient}
              disabled={creating || !newName.trim()}
              variant="outline"
            >
              Create
            </Button>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={onNext} disabled={!state.clientId}>
          Next
        </Button>
      </div>

      {contextMenu && (
        <div
          ref={contextMenuRef}
          role="menu"
          className="fixed z-[100] min-w-[160px] overflow-hidden rounded-md border bg-popover py-1 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <button
            type="button"
            className="block w-full px-3 py-1.5 text-left text-destructive hover:bg-accent focus:bg-accent focus:outline-none"
            onClick={() => deleteClient(contextMenu.client)}
          >
            Delete &quot;{contextMenu.client.name}&quot;
          </button>
        </div>
      )}
    </div>
  );
}
