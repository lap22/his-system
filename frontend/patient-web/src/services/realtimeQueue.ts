import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr'

export function createQueueConnection() {
  const hubUrl =
    import.meta.env.VITE_QUEUE_HUB_URL ?? 'https://localhost:7001/hubs/queue'

  return new HubConnectionBuilder()
    .withUrl(hubUrl)
    .withAutomaticReconnect()
    .configureLogging(LogLevel.Information)
    .build()
}
