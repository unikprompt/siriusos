'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { IconPlus } from '@tabler/icons-react';
import { useT } from '@/lib/i18n';
import type { TaskPriority } from '@/lib/types';

interface CreateTaskDialogProps {
  agents: string[];
  projects: string[];
  onCreated: () => void;
}

export function CreateTaskDialog({ agents, projects, onCreated }: CreateTaskDialogProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignee, setAssignee] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [project, setProject] = useState('');
  const [needsApproval, setNeedsApproval] = useState(false);

  function reset() {
    setTitle('');
    setDescription('');
    setAssignee('');
    setPriority('normal');
    setProject('');
    setNeedsApproval(false);
  }

  async function handleSubmit() {
    if (!title.trim()) {
      setError(t.pages.tasks.create.titleRequired);
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          assignee: assignee || undefined,
          priority,
          project: project || undefined,
          needsApproval,
        }),
      });

      if (res.ok) {
        reset();
        setError(null);
        setOpen(false);
        onCreated();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || t.pages.tasks.create.error);
      }
    } catch {
      setError(t.pages.tasks.create.networkError);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setError(null); }}>
      <DialogTrigger render={<Button size="sm" />}>
        <IconPlus className="size-4" />
        {t.pages.tasks.create.button}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.pages.tasks.create.title}</DialogTitle>
          <DialogDescription>{t.pages.tasks.create.description}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {error && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="task-title">{t.pages.tasks.create.titleLabel}</Label>
            <Input
              id="task-title"
              placeholder={t.pages.tasks.create.titlePlaceholder}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={500}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="task-desc">{t.pages.tasks.create.descriptionLabel}</Label>
            <Textarea
              id="task-desc"
              placeholder={t.pages.tasks.create.descriptionPlaceholder}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>{t.pages.tasks.create.assigneeLabel}</Label>
              <Select value={assignee} onValueChange={(v) => setAssignee(v ?? '')}>
                <SelectTrigger>
                  <SelectValue placeholder={t.pages.tasks.create.assigneePlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">{t.pages.tasks.create.unassigned}</SelectItem>
                  {agents.map((a) => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>{t.pages.tasks.create.priorityLabel}</Label>
              <Select value={priority} onValueChange={(v) => { if (v) setPriority(v as TaskPriority); }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="urgent">{t.badges.priority.urgent}</SelectItem>
                  <SelectItem value="high">{t.badges.priority.high}</SelectItem>
                  <SelectItem value="normal">{t.badges.priority.normal}</SelectItem>
                  <SelectItem value="low">{t.badges.priority.low}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {projects.length > 0 && (
            <div className="grid gap-2">
              <Label>{t.pages.tasks.create.projectLabel}</Label>
              <Select value={project} onValueChange={(v) => setProject(v ?? '')}>
                <SelectTrigger>
                  <SelectValue placeholder={t.pages.tasks.create.projectPlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">{t.common.none}</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex items-center gap-3">
            <Switch
              checked={needsApproval}
              onCheckedChange={setNeedsApproval}
              size="sm"
            />
            <Label className="cursor-pointer">{t.pages.tasks.create.needsApproval}</Label>
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={handleSubmit}
            disabled={!title.trim() || submitting}
          >
            {submitting ? t.pages.tasks.create.submitting : t.pages.tasks.create.submit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
