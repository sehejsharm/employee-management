/** The badges people can give. Keys are stored; labels can change freely. */
export const BADGES = {
  star: { label: "Star performer", blurb: "Outstanding work" },
  above: { label: "Above & beyond", blurb: "Went the extra mile" },
  teamwork: { label: "Team player", blurb: "Made the team better" },
  problem: { label: "Problem solver", blurb: "Cracked a hard one" },
  ownership: { label: "Ownership", blurb: "Owned it end to end" },
  learner: { label: "Fast learner", blurb: "Picked it up quickly" },
  creative: { label: "Creative spark", blurb: "A fresh idea that worked" },
  leadership: { label: "Leadership", blurb: "Led by example" },
} as const;

export type BadgeKey = keyof typeof BADGES;
export const BADGE_KEYS = Object.keys(BADGES) as BadgeKey[];

export const badgeLabel = (key: string) => BADGES[key as BadgeKey]?.label ?? "Recognition";

/** Awards founders and management give most often, offered as one-tap names. */
export const AWARD_SUGGESTIONS = ["Intern of the Month", "Employee of the Month", "Star of the Week", "Rookie of the Quarter", "Founders' Award"];
