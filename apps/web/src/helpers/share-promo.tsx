import { Link } from 'wouter-preact'

export function SharePromoArticle() {
  return (
    <article class="np-article np-article-lead np-share-promo">
      <div class="np-share-promo-kicker">Your Feed. Your AI. Your Briefing.</div>
      <div class="np-share-promo-layout">
        <div>
          <h2 class="np-section-header np-section-header-md np-share-promo-title">
            Bring your own AI to filter your own X feed.
          </h2>
          <div class="np-body np-share-promo-body">
            <p>
              Omens turns the accounts you already follow on X into a daily newspaper, using your own AI
              provider, model, and API key.
            </p>
          </div>
        </div>

        <div class="np-share-promo-rail">
          <div class="np-share-promo-facts">
            <div class="np-share-promo-fact">
              <span class="np-share-promo-fact-label">Source</span>
              Your own X follows and timeline
            </div>
            <div class="np-share-promo-fact">
              <span class="np-share-promo-fact-label">Model</span>
              OpenAI, Anthropic, Gemini, OpenRouter, or Ollama
            </div>
            <div class="np-share-promo-fact">
              <span class="np-share-promo-fact-label">Output</span>
              A personal briefing built around the posts you actually care about
            </div>
          </div>

          <div class="np-share-promo-actions">
            <Link href="/" class="np-share-promo-button">
              Get Your Own Omens
            </Link>
            <p class="np-share-promo-note">
              Configure your provider, choose your model, and let Omens sort signal from noise.
            </p>
          </div>
        </div>
      </div>
    </article>
  )
}
