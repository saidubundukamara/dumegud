import {
  FacebookLogoIcon,
  GlobeIcon,
  InstagramLogoIcon,
  LinkedinLogoIcon,
  SoundcloudLogoIcon,
  SpotifyLogoIcon,
  TiktokLogoIcon,
  XLogoIcon,
  YoutubeLogoIcon,
} from "@phosphor-icons/react/dist/ssr";
import type { Platform } from "@/lib/social";

export const SOCIAL_ICONS: Record<Platform, typeof GlobeIcon> = {
  website: GlobeIcon,
  instagram: InstagramLogoIcon,
  tiktok: TiktokLogoIcon,
  youtube: YoutubeLogoIcon,
  facebook: FacebookLogoIcon,
  x: XLogoIcon,
  linkedin: LinkedinLogoIcon,
  spotify: SpotifyLogoIcon,
  soundcloud: SoundcloudLogoIcon,
};
