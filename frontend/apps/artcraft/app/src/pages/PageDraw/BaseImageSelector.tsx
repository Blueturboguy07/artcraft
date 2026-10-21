import { ImagesIcon, MaximizeIcon, PencilIcon } from "lucide-react";
import { PublikImportImage, commandErrorMessage } from "@storyteller/tauri-api";
import { GalleryModal, GalleryItem } from "@storyteller/ui-gallery-modal";
import { useState } from "react";
import { toast } from "@storyteller/ui-toaster";
import { UploadEntryCard } from "~/components/media/UploadEntryCard";
import { BlankCanvasModal, type BaseSelectorImage } from "@storyteller/ui-pagedraw";

const MAX_GALLERY_SELECTIONS = 1;
const IMPORT_FALLBACK = "Could not add the image. Use a PNG, JPEG or WebP file.";

type BaseImageSelectorProps = {
  onImageSelect: (image: BaseSelectorImage) => void;
  showLoading?: boolean;
};

export const BaseImageSelector = ({
  onImageSelect,
  showLoading = false,
}: BaseImageSelectorProps) => {
  const [isGalleryModalOpen, setIsGalleryModalOpen] = useState(false);
  const [selectedGalleryImages, setSelectedGalleryImages] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isBlankCanvasModalOpen, setIsBlankCanvasModalOpen] = useState(false);

  const handleGalleryClick = () => setIsGalleryModalOpen(true);

  const handleGalleryClose = () => {
    setIsGalleryModalOpen(false);
    setSelectedGalleryImages([]);
  };

  const handleImageSelect = (mediaToken: string) => {
    setSelectedGalleryImages((prev) => {
      if (prev.includes(mediaToken)) return prev.filter((x) => x !== mediaToken);
      if (prev.length >= MAX_GALLERY_SELECTIONS) {
        return MAX_GALLERY_SELECTIONS === 1 ? [mediaToken] : prev;
      }
      return [...prev, mediaToken];
    });
  };

  const handleUseGalleryImages = (selectedItems: GalleryItem[]) => {
    const item = selectedItems[0];
    if (!item || !item.fullImage) {
      toast.error("Select an image first.");
      return;
    }
    const referenceImage: BaseSelectorImage = {
      url: item.fullImage,
      mediaToken: item.id,
      thumbnailUrlTemplate: item.thumbnailUrlTemplate,
    };
    handleGalleryClose();
    onImageSelect(referenceImage);
  };

  const handleBlankCanvasConfirm = (width: number, height: number) => {
    setIsBlankCanvasModalOpen(false);
    const blankImage: BaseSelectorImage = {
      url: "",
      mediaToken: `blank_canvas_${width}x${height}_${Math.random().toString(36).substring(2, 8)}`,
      isBlankCanvas: true,
      blankCanvasWidth: width,
      blankCanvasHeight: height,
    };
    onImageSelect(blankImage);
  };

  // The image stays on this computer: publik_import_image_command stores it and gives back
  // a local token and an asset:// URL. The editor takes one base image.
  const handleFileUpload = async (files: FileList) => {
    const file = files[0];
    if (!file) return;
    setIsLoading(true);
    try {
      const imported = await PublikImportImage(file, file.name);
      onImageSelect({
        mediaToken: imported.token,
        url: imported.url,
        fullImageUrl: imported.url,
      });
    } catch (err) {
      toast.error(commandErrorMessage(err, IMPORT_FALLBACK));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <div className="flex h-full w-full items-center justify-center overflow-hidden bg-ui-panel text-base-fg">
        <div className="aspect-video w-full max-w-5xl bg-ui-background">
          <UploadEntryCard
            icon={PencilIcon}
            title="Edit Image"
            description="Click to add an image, or drag an image here."
            accentBackgroundClass="bg-blue-500/40"
            accentBorderClass="border-blue-400/30"
            accept="image/png,image/jpeg,image/webp"
            onFilesSelected={handleFileUpload}
            primaryLabel="Select Image"
            secondaryLabel="Pick from Library"
            secondaryIcon={ImagesIcon}
            onSecondaryClick={handleGalleryClick}
            tertiaryLabel="Blank Canvas"
            tertiaryIcon={MaximizeIcon}
            onTertiaryClick={() => setIsBlankCanvasModalOpen(true)}
            disabled={isLoading || showLoading}
          />
        </div>
      </div>
      <GalleryModal
        isOpen={!!isGalleryModalOpen}
        onClose={handleGalleryClose}
        mode="select"
        selectedItemIds={selectedGalleryImages}
        onSelectItem={handleImageSelect}
        maxSelections={MAX_GALLERY_SELECTIONS}
        onUseSelected={handleUseGalleryImages}
        forceFilter="image"
      />
      <BlankCanvasModal
        isOpen={isBlankCanvasModalOpen}
        onClose={() => setIsBlankCanvasModalOpen(false)}
        onConfirm={handleBlankCanvasConfirm}
      />
    </>
  );
};
