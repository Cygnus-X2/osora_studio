import { Database, KeyRound, ShieldCheck } from "lucide-react";
import { PageHeader, SectionHeading } from "@/components/studio/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { store } from "@/data/store";
import { ROLE_LABELS, SKILL_LABELS } from "@/data/seed/people";
import { llmProviderAvailability } from "@/providers/llm";
import { ttsProviderAvailability } from "@/providers/tts";
import { checkAudioToolchain } from "@/providers/audio/ffprobe";
import { databaseStatus } from "@/lib/db/client";
import { relativeTime, titleCase } from "@/lib/format";
import type { Permission, StudioRole } from "@/domain/types";

export const metadata = { title: "Settings · Osora Studio" };

/** Granular permissions per role. Deliberately narrow by default. */
const ROLE_PERMISSIONS: Record<StudioRole, Permission[]> = {
  admin: [
    "experience.create",
    "experience.edit",
    "experience.publish",
    "experience.archive",
    "knowledge.edit",
    "evidence.verify",
    "review.scientific",
    "review.safety",
    "review.professional",
    "review.audio",
    "audio.edit",
    "experiment.manage",
    "settings.manage",
    "read",
  ],
  creator: ["experience.create", "experience.edit", "read"],
  scientific_reviewer: ["evidence.verify", "review.scientific", "read"],
  professional_reviewer: ["review.professional", "read"],
  safety_reviewer: ["review.safety", "read"],
  sound_designer: ["audio.edit", "read"],
  audio_reviewer: ["review.audio", "read"],
  experiment_owner: ["experiment.manage", "read"],
  publisher: ["experience.publish", "read"],
  viewer: ["read"],
};

const ROLE_NOTES: Partial<Record<StudioRole, string>> = {
  creator: "Can create and edit drafts. Cannot publish, and cannot approve their own work.",
  scientific_reviewer: "Approves evidence and scientific claims.",
  professional_reviewer:
    "Approves only inside the skills their profile holds — the role alone grants nothing.",
  publisher: "Can publish, but only a session with every blocking review satisfied.",
  viewer: "Read-only.",
};

export default async function SettingsPage() {
  const users = store.users();
  const professionals = store.professionals();
  const llm = llmProviderAvailability();
  const tts = ttsProviderAvailability();
  const toolchain = await checkAudioToolchain();
  const database = await databaseStatus();
  const runs = store.generationRuns();
  const audit = store.auditLog();

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Configuration"
        description="Providers, roles and the audit trail. No provider key is ever sent to the browser — the availability flags below are computed server-side and only the boolean crosses the wire."
      />

      <SectionHeading title="Providers" />
      <div className="mb-8 grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="size-4 text-stone" /> Language models
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {llm.map((provider) => (
              <div key={provider.id} className="flex items-center justify-between gap-2">
                <span className="text-[13px] text-ink-soft">{provider.label}</span>
                <Badge tone={provider.configured ? "sage" : "outline"}>
                  {provider.configured ? "Configured" : "No key"}
                </Badge>
              </div>
            ))}
            <p className="pt-1 text-[11px] leading-4 text-ink-faint">
              All calls run server-side. The provider modules import{" "}
              <code className="font-mono">server-only</code>, so a client component reaching for one
              fails at build time rather than shipping a key.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="size-4 text-stone" /> Voice &amp; sound
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {tts.map((provider) => (
              <div key={provider.id} className="flex items-center justify-between gap-2">
                <span className="text-[13px] text-ink-soft">{provider.label}</span>
                <Badge tone={provider.configured ? "sage" : "outline"}>
                  {provider.configured ? "Configured" : "No key"}
                </Badge>
              </div>
            ))}
            <p className="pt-1 text-[11px] leading-4 text-ink-faint">
              The mock provider generates real PCM audio, so the whole pipeline — generate, write,
              measure — runs offline exactly as it will in production.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-stone" /> Audio toolchain
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] text-ink-soft">ffprobe</span>
              <Badge tone={toolchain.ffprobe ? "sage" : "rust"}>
                {toolchain.ffprobe ? "Available" : "Missing"}
              </Badge>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] text-ink-soft">ffmpeg</span>
              <Badge tone={toolchain.ffmpeg ? "sage" : "rust"}>
                {toolchain.ffmpeg ? "Available" : "Missing"}
              </Badge>
            </div>
            {toolchain.ffprobeVersion && (
              <p className="font-mono text-[11px] leading-4 text-ink-faint">
                {toolchain.ffprobeVersion}
              </p>
            )}
            <p className="pt-1 text-[11px] leading-4 text-ink-faint">
              Without these, no asset can be marked ready. That is the intended failure mode.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Database className="size-4 text-stone" /> Database
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] text-ink-soft">Connection</span>
              <Badge
                tone={
                  !database.configured ? "outline" : database.reachable ? "sage" : "rust"
                }
              >
                {!database.configured
                  ? "Seeded data"
                  : database.reachable
                    ? "Connected"
                    : "Unreachable"}
              </Badge>
            </div>
            {database.reachable && (
              <>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] text-ink-soft">Migrations</span>
                  <span className="font-mono text-[13px] tabular-nums text-ink-muted">
                    {database.migrationsApplied}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] text-ink-soft">Tables</span>
                  <span className="font-mono text-[13px] tabular-nums text-ink-muted">
                    {database.tables}
                  </span>
                </div>
                <p className="font-mono text-[11px] leading-4 text-ink-faint">
                  {database.version}
                </p>
                <div className="space-y-0.5 border-t border-line pt-2">
                  {database.rowCounts
                    .filter((row) => row.rows > 0)
                    .map((row) => (
                      <div key={row.table} className="flex justify-between gap-2">
                        <span className="font-mono text-[11px] text-ink-faint">{row.table}</span>
                        <span className="font-mono text-[11px] tabular-nums text-ink-muted">
                          {row.rows}
                        </span>
                      </div>
                    ))}
                </div>
              </>
            )}
            {database.error && (
              <p className="text-[11px] leading-4 text-rust">{database.error}</p>
            )}
            <p className="pt-1 text-[11px] leading-4 text-ink-faint">
              {database.configured
                ? "Schema is applied by npm run db:migrate; the knowledge base by npm run db:seed."
                : "No DATABASE_URL set. The studio reads seeded data, which is the intended first-milestone behaviour."}
            </p>
          </CardContent>
        </Card>
      </div>

      <SectionHeading
        title="Roles and permissions"
        description="Granular by default. A role grants capability; a professional profile grants the right to approve within a skill. Both are required for a review to count."
      />
      <Card className="mb-8">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Role</TableHead>
                <TableHead>Permissions</TableHead>
                <TableHead>Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(Object.keys(ROLE_PERMISSIONS) as StudioRole[]).map((role) => (
                <TableRow key={role}>
                  <TableCell className="whitespace-nowrap font-medium text-ink">
                    {ROLE_LABELS[role]}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {ROLE_PERMISSIONS[role].map((permission) => (
                        <Badge
                          key={permission}
                          tone={permission === "read" ? "outline" : "stone"}
                        >
                          {permission}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-ink-muted">{ROLE_NOTES[role] ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <SectionHeading
        title="Mock users"
        description="Local development only. Replaced by Supabase auth with row-level security in production."
      />
      <Card className="mb-8">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead>Professional profile</TableHead>
                <TableHead>May approve</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => {
                const profile = user.professionalProfileId
                  ? professionals.find((p) => p.id === user.professionalProfileId)
                  : null;
                return (
                  <TableRow key={user.id}>
                    <TableCell>
                      <p className="font-medium text-ink">{user.name}</p>
                      <p className="font-mono text-[11px] text-ink-faint">{user.email}</p>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {user.roles.map((role) => (
                          <Badge key={role} tone="slate">
                            {ROLE_LABELS[role]}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-ink-muted">
                      {profile ? profile.name : <span className="text-ink-faint">—</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {profile && profile.reviewPermissions.length > 0 ? (
                          profile.reviewPermissions.map((skill) => (
                            <Badge key={skill} tone="sage">
                              {SKILL_LABELS[skill]}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-[12px] text-ink-faint">Nothing</span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <SectionHeading
            title="Generation runs"
            description="Opened before the provider call and closed with the result, so failures are recorded rather than lost."
          />
          <Card>
            <CardContent className="p-0">
              <div className="divide-y divide-line">
                {runs.map((run) => (
                  <div key={run.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="stone">{titleCase(run.capability)}</Badge>
                        <span className="font-mono text-[12px] text-ink-soft">{run.model}</span>
                      </div>
                      <Badge
                        tone={
                          run.status === "succeeded"
                            ? "sage"
                            : run.status === "failed"
                              ? "rust"
                              : "sand"
                        }
                      >
                        {titleCase(run.status)}
                      </Badge>
                    </div>
                    <p className="mt-1 text-[12px] leading-5 text-ink-muted">{run.input}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-ink-faint">
                      {run.inputTokens !== null && (
                        <span>
                          {run.inputTokens} in / {run.outputTokens} out
                        </span>
                      )}
                      {run.requestedAudioSeconds !== null && (
                        <span>
                          req {run.requestedAudioSeconds}s → act{" "}
                          {run.actualAudioSeconds ?? "unmeasured"}
                          {run.actualAudioSeconds !== null && "s"}
                        </span>
                      )}
                      <span>{relativeTime(run.createdAt)}</span>
                    </div>
                    {run.error && <p className="mt-1 text-[12px] leading-5 text-rust">{run.error}</p>}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div>
          <SectionHeading
            title="Audit log"
            description="Who did what, to which record, and when."
          />
          <Card>
            <CardContent className="p-0">
              <div className="divide-y divide-line">
                {audit.map((entry) => (
                  <div key={entry.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-[12px] text-clay">{entry.action}</span>
                      <span className="text-[11px] text-ink-faint">
                        {relativeTime(entry.createdAt)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[13px] leading-5 text-ink-soft">{entry.summary}</p>
                    <p className="text-[11px] text-ink-faint">
                      {entry.actorName} · {entry.targetType} · {entry.targetId}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
