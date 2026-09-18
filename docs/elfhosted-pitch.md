# ElfHosted pitch (paste into https://discord.elfhosted.com)

Their stated rule: "If you've got an addon you'd like ElfHosted, provided the
source-code is public, we can host it for you! Get in touch to discuss!"
SubRanker qualifies. Intake is Discord only, so this has to be sent by hand.

---

Hi, I'd like to ask about getting an addon hosted.

**SubRanker** is a subtitle addon that sits in front of your other subtitle
addons rather than replacing them. It queries them together, then ranks what
comes back against the release actually being played, so the right subtitle is
first instead of somewhere in a list of thirty.

Source is public and MIT: https://github.com/iarhamanwaar/subranker

What it does beyond ranking, all measured on real files rather than claimed:

- Drops dead links before they reach the client. On one provider that was
  roughly half of what it returned.
- Fixes timing. It aligns a candidate's cue timeline against a consensus of
  the others and corrects constant offset and framerate drift (23.976/25/24).
- Repairs mojibake, which showed up in about 14% of the files I sampled.
- Merges overlapping cues so two speakers are not drawn on top of each other.
- Strips embedded advertising, and optionally SDH sound descriptions.

Practical notes for hosting:

- Stateless. All per-user settings ride in a base64url segment on the path,
  so one instance serves everyone and there is nothing to persist.
- Multi-arch image on GHCR, amd64 and arm64, non-root, ~196MB, with a
  healthcheck.
- A cold request is 3 to 4 seconds and almost entirely upstream network; the
  compute is 1 to 36ms. Responses are cached after that.
- Outbound fetches go through an SSRF guard that blocks loopback, RFC1918 and
  the cloud metadata address, since it fetches URLs that upstreams hand it.
- It has no credentials of its own and stores nothing about users.

Happy to add whatever rate limiting or config you'd want, or to run it behind
your usual setup. Also glad to just answer questions if it's not a fit.
