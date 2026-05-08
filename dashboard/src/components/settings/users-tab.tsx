'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { fetchUsers, addUser, deleteUser, changePassword } from '@/lib/actions/settings';
import { useT } from '@/lib/i18n';

type User = { id: number; username: string; created_at: string };

export function UsersTab() {
  const t = useT();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);

  // Change-password modal state
  const [pwTarget, setPwTarget] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [pwSubmitting, setPwSubmitting] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);

  const tx = t.pages.settings.users;

  const load = useCallback(async () => {
    const data = await fetchUsers();
    setUsers(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAdd() {
    setAdding(true);
    setError('');
    const result = await addUser(username, password);
    if (result.success) {
      setUsername('');
      setPassword('');
      await load();
    } else {
      setError(result.error ?? tx.addError);
    }
    setAdding(false);
  }

  async function handleDelete(userId: number) {
    setError('');
    const result = await deleteUser(userId);
    if (result.success) {
      await load();
    } else {
      setError(result.error ?? tx.deleteError);
    }
  }

  function openPwModal(user: User) {
    setPwTarget(user);
    setNewPassword('');
    setPwError('');
    setPwSuccess(false);
  }

  function closePwModal() {
    setPwTarget(null);
    setNewPassword('');
    setPwError('');
    setPwSuccess(false);
  }

  async function handleChangePassword() {
    if (!pwTarget) return;
    setPwSubmitting(true);
    setPwError('');
    const result = await changePassword(pwTarget.id, newPassword);
    if (result.success) {
      setPwSuccess(true);
      setNewPassword('');
      // Auto-close after 1.5s so the user sees the confirmation
      setTimeout(closePwModal, 1500);
    } else {
      setPwError(result.error ?? tx.changePasswordError);
    }
    setPwSubmitting(false);
  }

  if (loading) {
    return <div className="h-48 rounded-xl bg-muted/30 animate-pulse" />;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{tx.title}</CardTitle>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <p className="text-sm text-muted-foreground">{tx.empty}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{tx.colId}</TableHead>
                  <TableHead>{tx.colUsername}</TableHead>
                  <TableHead>{tx.colCreated}</TableHead>
                  <TableHead className="w-48 text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>{u.id}</TableCell>
                    <TableCell className="font-medium">{u.username}</TableCell>
                    <TableCell className="text-muted-foreground">{u.created_at}</TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <Button variant="outline" size="xs" onClick={() => openPwModal(u)}>
                          {tx.changePassword}
                        </Button>
                        <Button
                          variant="destructive"
                          size="xs"
                          onClick={() => handleDelete(u.id)}
                          disabled={users.length <= 1}
                        >
                          {tx.delete}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{tx.addTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 max-w-sm">
            <div className="grid gap-1.5">
              <Label htmlFor="new-username">{tx.usernameLabel}</Label>
              <Input
                id="new-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={tx.usernamePlaceholder}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="new-password">{tx.passwordLabel}</Label>
              <Input
                id="new-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={tx.passwordPlaceholder}
              />
            </div>
            <Button onClick={handleAdd} disabled={adding} className="w-fit">
              {adding ? tx.adding : tx.addSubmit}
            </Button>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        </CardContent>
      </Card>

      <Dialog open={pwTarget !== null} onOpenChange={(open) => { if (!open) closePwModal(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{tx.changePasswordTitle}</DialogTitle>
            <DialogDescription>
              {pwTarget && tx.changePasswordSubtitle.replace('{user}', pwTarget.username)}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-1.5">
            <Label htmlFor="new-password-modal">{tx.newPasswordLabel}</Label>
            <Input
              id="new-password-modal"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={tx.passwordPlaceholder}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newPassword.length >= 6 && !pwSubmitting) {
                  handleChangePassword();
                }
              }}
            />
            {pwError && <p className="text-xs text-destructive mt-1">{pwError}</p>}
            {pwSuccess && <p className="text-xs text-success mt-1">{tx.changePasswordSuccess}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closePwModal} disabled={pwSubmitting}>
              {tx.cancel}
            </Button>
            <Button
              onClick={handleChangePassword}
              disabled={pwSubmitting || newPassword.length < 6}
            >
              {pwSubmitting ? tx.changing : tx.confirmChange}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
