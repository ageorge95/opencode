import { STOP_SERVICE_ON_QUIT_KEY } from "../storage/keys"
import { getStore } from "../storage/store"

export function getStopServiceOnQuit() {
  return getStore().get(STOP_SERVICE_ON_QUIT_KEY) === true
}

export function setStopServiceOnQuit(enabled: boolean) {
  getStore().set(STOP_SERVICE_ON_QUIT_KEY, enabled)
}
