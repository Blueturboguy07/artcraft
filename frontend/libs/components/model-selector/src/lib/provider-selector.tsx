///////////////////////////////////////////
// DEPRECATED: Use ClassyModelSelector only
///////////////////////////////////////////

import { useEffect, useMemo } from "react";
import { PopoverMenu, type PopoverItem } from "@storyteller/ui-popover";
import { ModelPage } from "./model-pages";
import { Model } from "@storyteller/model-list";
import { GenerationProvider } from "@storyteller/api-enums";
import {
  getProviderDisplayName,
  getProviderIcon,
  offersProviderChoice,
} from "./provider-icons";
import {
  useClassyModelSelectorStore,
  useSelectedProviderForModel,
} from "./classy-model-selector-store";

interface ProviderSelectorProps {
  page: ModelPage;
  model: Model | undefined;
  providersByModel?: Partial<Record<string, GenerationProvider[]>>;
  panelTitle?: string;
  buttonClassName?: string;
  panelClassName?: string;
  triggerLabel?: string;
}

// publik API is the only provider: the publik balance or the person's own key.
const DEFAULT_PROVIDER_OPTIONS: GenerationProvider[] = [
  GenerationProvider.Publik,
];

export function ProviderSelector({
  page,
  model,
  providersByModel,
  ...popoverProps
}: ProviderSelectorProps) {
  const { setSelectedProvider } = useClassyModelSelectorStore();

  const modelId = model?.id;
  const allowedProviders: GenerationProvider[] = useMemo(() => {
    if (!modelId) return DEFAULT_PROVIDER_OPTIONS;
    const providers = providersByModel?.[modelId] ?? model?.getProviders() ?? DEFAULT_PROVIDER_OPTIONS;
    return providers.length > 0 ? providers : DEFAULT_PROVIDER_OPTIONS;
  }, [providersByModel, modelId, model]);

  const selectedProvider = useSelectedProviderForModel(page, modelId);

  useEffect(() => {
    if (!modelId) return;
    if ((!selectedProvider || !allowedProviders.includes(selectedProvider)) && allowedProviders.length > 0) {
      setSelectedProvider(page, modelId, allowedProviders[0]);
    }
  }, [page, modelId, selectedProvider, allowedProviders, setSelectedProvider]);

  const items: Omit<PopoverItem, "selected">[] = useMemo(
    () =>
      allowedProviders.map((p) => ({
        label: getProviderDisplayName(p),
        icon: getProviderIcon(p),
        model: undefined,
        provider: p,
      })),
    [allowedProviders]
  );

  const list = useMemo(
    () =>
      items.map((item) => ({
        ...item,
        selected: (item as any).provider === selectedProvider,
      })),
    [items, selectedProvider]
  );

  const handleSelect = (item: PopoverItem) => {
    if (!modelId) return;
    const prov: GenerationProvider | undefined = (item as any).provider as
      | GenerationProvider
      | undefined;
    if (!prov) return;
    setSelectedProvider(page, modelId, prov);
  };

  // publik API alone is no choice: show nothing.
  if (!offersProviderChoice(allowedProviders)) return null;

  return (
    <PopoverMenu
      items={list}
      onSelect={handleSelect}
      mode="hoverSelect"
      showIconsInList
      {...popoverProps}
      buttonClassName="border-0 bg-transparent p-0 hover:bg-transparent text-lg hover:opacity-80 shadow-none"
    />
  );
}

export default ProviderSelector;
