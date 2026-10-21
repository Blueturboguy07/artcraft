import { PublikAccountBlock } from "./PublikAccountBlock";

// publik API (or the person's own key) is the only AI provider. There is no ArtCraft
// account, and no Grok or Midjourney sign-in.
export const AccountSettingsPane = () => {
  return (
    <div className="flex flex-col gap-5 pt-3 text-base-fg">
      <PublikAccountBlock />
    </div>
  );
};
