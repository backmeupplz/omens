export type SetupStep = {
  label: string
  detail: string
  state: 'done' | 'active' | 'pending'
}

export function SetupStateBlock({
  kicker,
  title,
  intro,
  steps,
  actions,
  children,
}: {
  kicker?: string
  title: string
  intro: string
  steps: SetupStep[]
  actions?: preact.ComponentChildren
  children?: preact.ComponentChildren
}) {
  return (
    <div class="np-setup-state">
      {kicker && <p class="np-setup-kicker">{kicker}</p>}
      <h2 class="np-setup-title">{title}</h2>
      <p class="np-setup-intro">{intro}</p>
      <div class="np-setup-steps">
        {steps.map((step) => (
          <div key={step.label} class="np-setup-step">
            <span class={`np-setup-step-state np-setup-step-state-${step.state}`}>
              {step.state === 'done' ? 'Done' : step.state === 'active' ? 'Now' : 'Later'}
            </span>
            <div class="np-setup-step-copy">
              <p class="np-setup-step-label">{step.label}</p>
              <p class="np-setup-step-detail">{step.detail}</p>
            </div>
          </div>
        ))}
      </div>
      {actions && <div class="np-setup-actions">{actions}</div>}
      {children && <div class="np-setup-body">{children}</div>}
    </div>
  )
}
