"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Trash2 } from "lucide-react";
import { deleteLeads } from "@/lib/lead-queries";
import { toast } from "sonner";

type Props = {
  selectedCount: number;
  selectedIds: string[];
  onDone: () => void;
};

export function LeadDelete({ selectedCount, selectedIds, onDone }: Props) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (selectedCount === 0) return null;

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteLeads(selectedIds);
      toast.success(`Deleted ${selectedCount.toLocaleString()} leads`);
      setOpen(false);
      onDone();
    } catch (err) {
      toast.error(
        `Failed: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-1.5 text-destructive hover:text-destructive"
      >
        <Trash2 className="size-3.5" />
        Delete ({selectedCount.toLocaleString()})
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {selectedCount.toLocaleString()} leads?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. These leads will be permanently
              removed from the database.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
