import { useEffect } from "react";
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { SoundManager } from "@storyteller/soundboard";
import { toast } from "@storyteller/ui-toaster";
import { GenerationAction, GenerationModel, GenerationServiceProvider } from "./common";
import { BasicEventWrapper } from "../../common/BasicEventWrapper";
import { commandErrorMessage } from "@storyteller/tauri-api";

export type GenerationEnqueueFailureEvent = {
  action: GenerationAction,
  service: GenerationServiceProvider,
  model?: GenerationModel | string,
  reason?: string,
}; 

export const useGenerationEnqueueFailureEvent = () => {
  useEffect(() => {
    let isUnmounted = false;
    let unlisten: Promise<UnlistenFn>;

    const setup = async () => {
      unlisten = listen<BasicEventWrapper<GenerationEnqueueFailureEvent>>('generation-enqueue-failure-event', async (event) => {
        console.log("Generation enqueue failure event received:", event);
        await SoundManager.playEnqueueFailure();
        const message = generationEnqueueFailureMessage(event.payload.data);
        toast.error(message);
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

// One plain sentence: Rust's reason when it is readable, else what failed and what to do.
export const generationEnqueueFailureMessage = (event: GenerationEnqueueFailureEvent) =>
  commandErrorMessage(event.reason, fallbackMessage(event.action));

const fallbackMessage = (action: GenerationAction) => {
  switch (action) {
    case GenerationAction.GenerateImage:
      return "Could not start the image. Try again.";
    case GenerationAction.GenerateAudio:
      return "Could not start the audio. Try again.";
    default:
      return "Could not start the request. Try again.";
  }
}
