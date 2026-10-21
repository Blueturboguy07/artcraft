import { useEffect } from "react";
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { SoundManager } from "@storyteller/soundboard";
import { toast } from "@storyteller/ui-toaster";
import { GenerationAction, GenerationModel, GenerationServiceProvider } from "./common";
import { BasicEventWrapper } from "../../common/BasicEventWrapper";

type GenerationCompleteEvent = {
  action?: GenerationAction,
  service: GenerationServiceProvider,
  model?: GenerationModel | string,
};

export const useGenerationCompleteEvent = () => {
  useEffect(() => {
    let isUnmounted = false;
    let unlisten: Promise<UnlistenFn>;

    const setup = async () => {
      unlisten = listen<BasicEventWrapper<GenerationCompleteEvent>>('generation-complete-event', async (event) => {
        console.log("Generation complete event received:", event);
        await SoundManager.playGenerationSuccess();
        const message = makeMessage(event.payload.data);
        toast.success(message);
      });

      if (isUnmounted) {
        unlisten.then(f => f()); // Unsubscribe if unmounted early.
      }
    };

    setup();
    
    return () => {
      isUnmounted = true;
      unlisten.then(f => f());
    };

  }, []);
}

const makeMessage = (event: GenerationCompleteEvent) => {
  switch (event.action) {
    case GenerationAction.GenerateImage:
      return "Your image is ready.";
    case GenerationAction.GenerateAudio:
      return "Your audio is ready.";
    default:
      return "Your result is ready.";
  }
}
