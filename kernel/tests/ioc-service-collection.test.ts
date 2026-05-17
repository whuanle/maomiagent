import { describe, expect, it } from "bun:test"
import {
  DependencyModuleBase,
  ModuleAlreadyLoadedError,
  type DependencyModuleRuntimeContext,
  createServiceCollection,
  createServiceToken,
  type DependencyModuleContext,
} from "../ioc"

const HOST_TOKEN = createServiceToken<string>("ioc.host")
const SHARED_TOKEN = createServiceToken<string>("ioc.shared")
const FEATURE_TOKEN = createServiceToken<string>("ioc.feature")
const ROOT_TOKEN = createServiceToken<string>("ioc.root")
const REQUEST_ID_TOKEN = createServiceToken<string>("ioc.request-id")
const TICK_TOKEN = createServiceToken<number>("ioc.tick")
const AI_ROUTE_TOKEN = createServiceToken<string>("ioc.ai.route")
const APPLICATION_PROJECTION_TOKEN = createServiceToken<string>("ioc.application.projection")
const FRONTEND_BRIDGE_TOKEN = createServiceToken<string>("ioc.frontend.bridge")

describe("IOC service collection", () => {
  it("plans dependency modules before building the container", () => {
    const trace: string[] = []
    let sawPlanningContext = false

    class SharedModule extends DependencyModuleBase {
      static moduleId = "shared.module"

      override configureServices(context: DependencyModuleContext): void {
        sawPlanningContext = sawPlanningContext || context.container === undefined
        trace.push(`configure:${context.module.moduleId}`)
        context.addSingleton(SHARED_TOKEN, {
          useValue: "shared",
          source: context.module.moduleId,
        })
      }
    }

    class FeatureModule extends DependencyModuleBase {
      static moduleId = "feature.module"
      static dependencies = [SharedModule] as const

      override configureServices(context: DependencyModuleContext): void {
        trace.push(`configure:${context.module.moduleId}`)
        trace.push(`modules:${context.modules.map((item) => item.moduleId).join("|")}`)
        context.addTransient(FEATURE_TOKEN, {
          useFactory: (resolver) => `${resolver.resolve(HOST_TOKEN)}:${resolver.resolve(SHARED_TOKEN)}:feature`,
          source: context.module.moduleId,
        })
      }
    }

    class RootModule extends DependencyModuleBase {
      static moduleId = "root.module"
      static dependencies = [FeatureModule] as const

      override configureServices(context: DependencyModuleContext): void {
        trace.push(`configure:${context.module.moduleId}`)
        expect(context.hasModule(FeatureModule)).toBe(true)
        expect(context.getModule("shared.module")?.moduleId).toBe("shared.module")
        context.addTransient(ROOT_TOKEN, {
          useFactory: (resolver) => `${resolver.resolve(FEATURE_TOKEN)}:root`,
          source: context.module.moduleId,
        })
      }
    }

    const services = createServiceCollection()
    services.addSingleton(HOST_TOKEN, {
      useValue: "host",
      source: "host.bootstrap",
    })

    const result = services.loadModules(RootModule)

    expect(sawPlanningContext).toBe(true)
    expect(result.modules.map((item) => item.moduleId)).toEqual([
      "shared.module",
      "feature.module",
      "root.module",
    ])
    expect(services.listModules().map((item) => item.moduleId)).toEqual([
      "shared.module",
      "feature.module",
      "root.module",
    ])
    expect(trace).toEqual([
      "configure:shared.module",
      "configure:feature.module",
      "modules:shared.module|feature.module|root.module",
      "configure:root.module",
    ])

    expect(services.listRegistrations(ROOT_TOKEN)).toEqual([
      {
        planId: expect.any(String),
        tokenDescription: "ioc.root",
        bindingKind: "factory",
        lifetime: "transient",
        order: 100,
        source: "root.module",
      },
    ])

    const container = services.buildContainer()

    expect(container.resolve(SHARED_TOKEN)).toBe("shared")
    expect(container.resolve(FEATURE_TOKEN)).toBe("host:shared:feature")
    expect(container.resolve(ROOT_TOKEN)).toBe("host:shared:feature:root")
    expect(container.resolve(RootModule)).toBe(result.rootModule.instance)
  })

  it("exposes addModule, buildServiceProvider, scoped, and transient helpers", async () => {
    class RequestContext {
      static inject = [REQUEST_ID_TOKEN] as const

      constructor(readonly requestId: string) {}
    }

    class RuntimeModule extends DependencyModuleBase {
      static moduleId = "runtime.module"

      private requestSequence = 0
      private tick = 0

      override configureServices(context: DependencyModuleContext): void {
        context.addScoped(REQUEST_ID_TOKEN, {
          useFactory: () => {
            this.requestSequence += 1
            return `req-${this.requestSequence}`
          },
          source: context.module.moduleId,
        })
        context.addScoped(RequestContext, {
          useClass: RequestContext,
          source: context.module.moduleId,
        })
        context.addTransient(TICK_TOKEN, {
          useFactory: () => {
            this.tick += 1
            return this.tick
          },
          source: context.module.moduleId,
        })
      }
    }

    const services = createServiceCollection()
    services.addModule(RuntimeModule)

    const container = services.buildServiceProvider()
    const scope = container.createScope("request")

    expect(scope.resolve(RequestContext).requestId).toBe("req-1")
    expect(scope.resolve(RequestContext).requestId).toBe("req-1")
    expect(scope.resolve(TICK_TOKEN)).toBe(1)
    expect(scope.resolve(TICK_TOKEN)).toBe(2)

    await scope.dispose()
  })

  it("supports module lifecycle hooks for ai, application, and frontend layering", async () => {
    const trace: string[] = []

    class AiProviderModule extends DependencyModuleBase {
      static moduleId = "ai.provider"

      override preConfigureServices(context: DependencyModuleContext): void {
        trace.push(`pre:${context.module.moduleId}`)
      }

      override configureServices(context: DependencyModuleContext): void {
        trace.push(`configure:${context.module.moduleId}`)
        context.addSingleton(AI_ROUTE_TOKEN, {
          useValue: "route:primary",
          source: context.module.moduleId,
        })
      }

      override postConfigureServices(context: DependencyModuleContext): void {
        trace.push(`post:${context.module.moduleId}`)
      }

      override onStart(context: DependencyModuleRuntimeContext): void {
        trace.push(`start:${context.module.moduleId}`)
      }

      override onStop(context: DependencyModuleRuntimeContext): void {
        trace.push(`stop:${context.module.moduleId}`)
      }
    }

    class ApplicationConversationModule extends DependencyModuleBase {
      static moduleId = "application.conversation"
      static dependencies = [AiProviderModule] as const

      override preConfigureServices(context: DependencyModuleContext): void {
        trace.push(`pre:${context.module.moduleId}`)
      }

      override configureServices(context: DependencyModuleContext): void {
        trace.push(`configure:${context.module.moduleId}`)
        context.addSingleton(APPLICATION_PROJECTION_TOKEN, {
          useFactory: (services) => `${services.resolve(AI_ROUTE_TOKEN)}:projection`,
          source: context.module.moduleId,
        })
      }

      override postConfigureServices(context: DependencyModuleContext): void {
        trace.push(`post:${context.module.moduleId}`)
      }

      override onStart(context: DependencyModuleRuntimeContext): void {
        trace.push(`start:${context.module.moduleId}`)
      }

      override onStop(context: DependencyModuleRuntimeContext): void {
        trace.push(`stop:${context.module.moduleId}`)
      }
    }

    class FrontendShellModule extends DependencyModuleBase {
      static moduleId = "frontend.shell"
      static dependencies = [ApplicationConversationModule] as const

      override preConfigureServices(context: DependencyModuleContext): void {
        trace.push(`pre:${context.module.moduleId}`)
      }

      override configureServices(context: DependencyModuleContext): void {
        trace.push(`configure:${context.module.moduleId}`)
      }

      override postConfigureServices(context: DependencyModuleContext): void {
        trace.push(`post:${context.module.moduleId}`)
        context.addSingleton(FRONTEND_BRIDGE_TOKEN, {
          useFactory: (services) => `${services.resolve(APPLICATION_PROJECTION_TOKEN)}:frontend`,
          source: context.module.moduleId,
        })
      }

      override onStart(context: DependencyModuleRuntimeContext): void {
        trace.push(`start:${context.module.moduleId}`)
        trace.push(`bridge:${context.container.resolve(FRONTEND_BRIDGE_TOKEN)}`)
      }

      override onStop(context: DependencyModuleRuntimeContext): void {
        trace.push(`stop:${context.module.moduleId}`)
      }
    }

    const services = createServiceCollection()
    services.addModule(FrontendShellModule)

    const host = services.buildModuleHost()

    expect(host.listModules().map((item) => item.moduleId)).toEqual([
      "ai.provider",
      "application.conversation",
      "frontend.shell",
    ])

    await host.start()
    await host.stop()
    await host.dispose()

    expect(trace).toEqual([
      "pre:ai.provider",
      "pre:application.conversation",
      "pre:frontend.shell",
      "configure:ai.provider",
      "configure:application.conversation",
      "configure:frontend.shell",
      "post:ai.provider",
      "post:application.conversation",
      "post:frontend.shell",
      "start:ai.provider",
      "start:application.conversation",
      "start:frontend.shell",
      "bridge:route:primary:projection:frontend",
      "stop:frontend.shell",
      "stop:application.conversation",
      "stop:ai.provider",
    ])
  })

  it("rejects loading the same module graph twice into one service collection", () => {
    class RootModule extends DependencyModuleBase {
      static moduleId = "repeat.root"
    }

    const services = createServiceCollection()

    services.loadModules(RootModule)

    expect(() => services.loadModules(RootModule)).toThrow(ModuleAlreadyLoadedError)
  })
})