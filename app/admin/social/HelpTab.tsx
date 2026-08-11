function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#0d0d0d] border border-green-600 rounded-xl p-5">
      <h2 className="text-base font-semibold text-white mb-3">{title}</h2>
      <div className="space-y-2 text-sm text-zinc-300">{children}</div>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#1A3A5C] text-white text-xs font-semibold flex items-center justify-center mt-0.5">
        {n}
      </span>
      <p>{children}</p>
    </div>
  );
}

export default function HelpTab() {
  return (
    <div className="space-y-4">
      <Section title="1. Connect a brand">
        <Step n={1}>
          Go to the <strong className="text-white">Brands</strong> tab and click <strong className="text-white">+ Add Brand</strong> if the
          product isn&apos;t listed yet.
        </Step>
        <Step n={2}>
          Click <strong className="text-white">Connect Facebook</strong> on the brand card and pick the Facebook Page to link. This also
          picks up the Page&apos;s connected Instagram Business account automatically, if it has one.
        </Step>
        <Step n={3}>
          Fill in <strong className="text-white">Website link</strong> (gets appended to Facebook posts — Meta auto-generates a preview
          card from it), <strong className="text-white">Brand voice notes</strong> (how this brand should sound), and the{" "}
          <strong className="text-white">FAQ document</strong> (used to auto-answer simple DMs — see Inbox below). Click{" "}
          <strong className="text-white">Save</strong>.
        </Step>
      </Section>

      <Section title="2. Generate content">
        <Step n={1}>
          Go to the <strong className="text-white">Content</strong> tab and click <strong className="text-white">Generate Content</strong>.
        </Step>
        <Step n={2}>Pick a brand, choose Facebook and/or Instagram, and set how many posts (up to 14 per batch).</Step>
        <Step n={3}>
          Claude writes each post in that brand&apos;s voice and drops them in as <strong className="text-white">draft</strong> — nothing
          gets posted automatically.
        </Step>
      </Section>

      <Section title="3. Approve &amp; schedule">
        <Step n={1}>Review a draft post — edit the hook/caption directly in the card if needed.</Step>
        <Step n={2}>
          Click <strong className="text-white">Approve</strong>.
        </Step>
        <Step n={3}>
          Pick a date/time and click <strong className="text-white">Schedule</strong>. A cron job checks every 10 minutes and
          automatically publishes anything whose scheduled time has passed — there&apos;s no separate &quot;post now&quot; step.
        </Step>
        <Step n={4}>
          <strong className="text-white">Instagram posts require a linked video asset</strong> — upload one in the Video tab first, then
          link it to the post from the dropdown on the content card before scheduling. Facebook posts don&apos;t need this.
        </Step>
      </Section>

      <Section title="4. Video assets (for Instagram)">
        <Step n={1}>
          Go to the <strong className="text-white">Video</strong> tab and upload a vertical video for a brand.
        </Step>
        <Step n={2}>
          Once it finishes processing (status <strong className="text-white">ready</strong>), it becomes available to link from any
          Instagram post in the Content tab.
        </Step>
      </Section>

      <Section title="5. Inbox">
        <Step n={1}>
          Incoming Facebook/Instagram DMs are auto-triaged against the brand&apos;s FAQ document. Simple, confidently-matched questions
          get an automatic reply sent immediately.
        </Step>
        <Step n={2}>
          Anything else — complaints, sales questions, anything ambiguous — is left for you under{" "}
          <strong className="text-white">Needs you</strong>. Public comments are always routed here too; they&apos;re never
          auto-replied.
        </Step>
        <Step n={3}>
          Click <strong className="text-white">Mark resolved</strong> once you&apos;ve handled it.
        </Step>
      </Section>
    </div>
  );
}
