'use client';

import { useEffect, useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  IconDots,
  IconPlayerPlay,
  IconPlayerStop,
  IconRefresh,
  IconTrash,
  IconLoader2,
} from '@tabler/icons-react';
interface AgentActionsProps {
  agentName: string;
  org: string;
  running: boolean;
  onAction?: () => void;
}

type LifecycleAction = 'start' | 'stop' | 'restart_continue' | 'restart_fresh';

export function AgentActions({
  agentName,
  org,
  running,
  onAction,
}: AgentActionsProps) {
  const [loading, setLoading] = useState(false);
  const [confirmFreshRestart, setConfirmFreshRestart] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [isRunning, setIsRunning] = useState(running);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => setIsRunning(running), [running]);

  async function handleLifecycle(action: LifecycleAction) {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(agentName)}/lifecycle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, org }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Action failed (${res.status})`);
      }

      if (action === 'start') setIsRunning(true);
      if (action === 'stop') setIsRunning(false);
      const labels: Record<LifecycleAction, string> = {
        start: 'Inicio solicitado',
        stop: 'Detención solicitada',
        restart_continue: 'Reinicio con continuidad solicitado',
        restart_fresh: 'Reinicio limpio solicitado',
      };
      setFeedback({ type: 'success', message: labels[action] });
      onAction?.();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setLoading(false);
      setTimeout(() => setFeedback(null), 3000);
    }
  }

  async function handleDelete() {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await fetch(
        `/api/agents/${encodeURIComponent(agentName)}/lifecycle?org=${encodeURIComponent(org)}`,
        {
        method: 'DELETE',
        },
      );

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Delete failed (${res.status})`);
      }

      setFeedback({ type: 'success', message: 'Agent deleted' });
      setConfirmDelete(false);
      setDeleteConfirmation('');
      onAction?.();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setLoading(false);
      setTimeout(() => setFeedback(null), 3000);
    }
  }

  return (
    <div
      className="relative"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon-sm" className="h-6 w-6" />
          }
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          {loading ? (
            <IconLoader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <IconDots className="h-3.5 w-3.5" />
          )}
          <span className="sr-only">Agent actions</span>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" sideOffset={4}>
          {!isRunning && (
            <DropdownMenuItem onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void handleLifecycle('start');
            }}>
              <IconPlayerPlay className="h-4 w-4" />
              Start
            </DropdownMenuItem>
          )}
          {isRunning && (
            <DropdownMenuItem onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void handleLifecycle('stop');
            }}>
              <IconPlayerStop className="h-4 w-4" />
              Stop
            </DropdownMenuItem>
          )}
          {isRunning && (
            <>
              <DropdownMenuItem onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void handleLifecycle('restart_continue');
              }}>
                <IconRefresh className="h-4 w-4" />
                Restart (Continue)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setConfirmFreshRestart(true);
              }}>
                <IconRefresh className="h-4 w-4" />
                Restart (Fresh)
              </DropdownMenuItem>
            </>
          )}

          <DropdownMenuSeparator />

          <DropdownMenuItem
            variant="destructive"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setConfirmDelete(true);
            }}
          >
            <IconTrash className="h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Feedback toast-like display */}
      {feedback && (
        <span
          className={`absolute -bottom-6 right-0 z-10 whitespace-nowrap text-xs ${
            feedback.type === 'success' ? 'text-success' : 'text-destructive'
          }`}
        >
          {feedback.message}
        </span>
      )}

      <Dialog open={confirmFreshRestart} onOpenChange={setConfirmFreshRestart}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reiniciar con sesión limpia</DialogTitle>
            <DialogDescription>
              <strong>{agentName}</strong> iniciará una conversación nueva y no continuará
              el hilo activo. Su configuración, memoria persistida, crons y credenciales se conservan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmFreshRestart(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmFreshRestart(false);
                void handleLifecycle('restart_fresh');
              }}
              disabled={loading}
            >
              Reiniciar en limpio
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog
        open={confirmDelete}
        onOpenChange={(open) => {
          setConfirmDelete(open);
          if (!open) setDeleteConfirmation('');
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar agente completamente</DialogTitle>
            <DialogDescription>
              Se eliminarán <strong>{agentName}</strong>, su definición, credenciales,
              memoria, estado, logs, crons y buzones. Las tareas y entregables de la
              organización se conservan como historial. Esta acción no se puede deshacer.
            </DialogDescription>
            <div className="space-y-2 pt-2">
              <label htmlFor={`delete-${agentName}`} className="text-sm">
                Escribe <strong>{agentName}</strong> para confirmar:
              </label>
              <Input
                id={`delete-${agentName}`}
                value={deleteConfirmation}
                onChange={(event) => setDeleteConfirmation(event.target.value)}
                autoComplete="off"
              />
            </div>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmDelete(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleDelete()}
              disabled={loading || deleteConfirmation !== agentName}
            >
              {loading && <IconLoader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Eliminar agente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
