---
title: 'Which banner tools do ChatGPT and Gemini recommend?'
description: 'Four measurements, 10 Vietnamese prompts, 2 AI assistants. Canva was named in all 56 unbranded answers; a small open-source tool in none. Data included.'
pubDate: 2026-11-26
---

A seller types into ChatGPT: "I sell on Shopee and I need a flash sale banner, which tool should I use?" The answer names three or four tools. If you make one of the tools that was not named, you just lost a customer you will never hear about.

We make Oia, one of the tools that was not named. So we measured it, four times over seven days, and we are publishing the data so you can check our work.

## What we asked

We wrote 16 prompts in Vietnamese, in the words a marketplace seller would actually type. Ten of them form the screening set we ran every time.

Seven prompts do not name any tool:

| ID | Prompt (Vietnamese) | English gloss | Type |
|---|---|---|---|
| 01 | Tôi bán hàng trên Shopee, cần làm banner flash sale, nên dùng công cụ nào? | I sell on Shopee and need a flash sale banner, which tool should I use? | discovery |
| 02 | Có công cụ nào làm banner quảng cáo cho TikTok Shop nhanh và miễn phí không? | Is there a tool that makes TikTok Shop ad banners quickly and for free? | discovery |
| 03 | Người bán trên sàn thương mại điện tử thường dùng phần mềm gì để thiết kế banner sale? | What software do e-commerce marketplace sellers usually use to design sale banners? | discovery |
| 05 | Cách đổi giá trên banner sale cho Shopee mà không phải thiết kế lại từ đầu? | How do I change the price on a Shopee sale banner without redesigning it? | needs |
| 07 | Tôi cần xuất khung overlay livestream trong suốt 1080x1920 để dùng với OBS, công cụ nào làm được? | I need to export a transparent 1080x1920 livestream overlay for OBS, which tool does it? | needs |
| 09 | Có công cụ làm banner cho người bán hàng nào miễn phí thực sự không, hay đều phải trả thuê bao? | Is any seller banner tool really free, or do they all need a subscription? | cost |
| 11 | So sánh trình thiết kế banner trực tuyến phổ biến với các công cụ AI tạo banner bán hàng: cái nào phù hợp shop nhỏ không có designer? | Popular online banner editors versus AI banner tools: which fits a small shop with no designer? | evaluation |

Three prompts name our product: "What is Oia, the Shopee banner app, and is it free?", "How is Oia different from Canva for flash sale banners?" and "How does changing a price on an AI banner in Oia work, does the style stay?"

## How we measured

- **Assistants:** the consumer ChatGPT and Gemini apps, in a signed-in desktop browser, with Vietnamese prompts. No APIs.
- **Runs:** four, on 20 November 2026 (before and after a site update), 23 November and 26 November. One answer per prompt per assistant per run.
- **Counting:** a brand counts as mentioned when its name appears in the answer. Order is the first brand named. Matching is done by a fixed name list, not by an AI judge.
- **Uncertainty:** 95% Wilson intervals. With 7 or 3 prompts per cell these are wide, so we treat each cell as a description and pool the four runs for the totals.
- **One measurement error:** one Gemini answer on 20 November was captured incompletely (39 characters). It is marked `valid = no` in the data and excluded from the totals.

## Finding 1: Canva is in every answer

Across the four runs, the seven unnamed prompts produced 56 answers. Canva was named in all 56 (Wilson 95%: 93.6% to 100%) and was the first brand named in 53 of them.

| Run | Assistant | Canva | Adobe Express | Photoroom | CapCut | Pebblely | Oia |
|---|---|---|---|---|---|---|---|
| 20 Nov, before | ChatGPT | 7 | 4 | 1 | 1 | 0 | 0 |
| 20 Nov, before | Gemini | 7 | 3 | 5 | 3 | 1 | 0 |
| 20 Nov, after | ChatGPT | 7 | 4 | 2 | 1 | 0 | 0 |
| 20 Nov, after | Gemini | 7 | 5 | 3 | 2 | 0 | 0 |
| 23 Nov | ChatGPT | 7 | 5 | 1 | 2 | 0 | 0 |
| 23 Nov | Gemini | 7 | 4 | 2 | 2 | 0 | 0 |
| 26 Nov | ChatGPT | 7 | 5 | 4 | 1 | 0 | 0 |
| 26 Nov | Gemini | 7 | 4 | 5 | 4 | 0 | 0 |

Each number is "out of 7 prompts".

## Finding 2: a small brand is invisible when its name is not in the question

Oia was named in 0 of those 56 answers. The upper bound of the 95% interval is 6.4%. This is not a rounding error.

We had done the technical work first: an `llms.txt` file, structured data, markdown versions of every page, a sitemap, all AI crawlers allowed. None of it produced a single unbranded mention. Metadata on your own site does not put you in the answer. It only makes you readable if something else brings the assistant to you.

## Finding 3: knowing the name is not the same as knowing the product

With the name in the question, both assistants mentioned Oia every time: ChatGPT in 12 of 12 valid answers, Gemini in 11 of 11. But look at what the answers contained.

ChatGPT named the Oia website in only 1 of 12 answers. On 23 November it described the app correctly and ended with "Website: oia.solutions". Three days later, asked the same question, it said it could not identify an app called Oia. That same day, a `site:oia.solutions` search on Bing returned no pages, and Bing Webmaster Tools listed zero indexed URLs for the site. ChatGPT's web search is reported to rely in part on Bing's index. We did not prove causation, but the timing is hard to ignore.

Gemini named the website in 10 of 11 valid answers and cited it in comparison tables it built on its own.

The practical lesson: "Have you heard of X?" and "Can you describe X correctly?" are two different tests. Run both.

## Finding 4: a single run is noise

Photoroom's count on ChatGPT across the four runs, with identical prompts, was 1, 2, 1 and 4 out of 7. On Gemini it was 5, 3, 2 and 5. Anyone quoting one run's number is quoting noise. Four runs are the minimum we would show anyone.

## What we changed, and what happened

| Date | What we did | Unbranded mentions of Oia | Where the assistants got our name |
|---|---|---|---|
| 20 Nov | `llms.txt`, JSON-LD, markdown mirrors, sitemap | 0 of 7 on both | Gemini: our own site. ChatGPT: none |
| 21 to 23 Nov | Submitted to search consoles and third-party listings (AlternativeTo, Unikorn) | 0 of 7 on both | our own site (ChatGPT once, Gemini always) |
| 26 Nov | Listings approved and live | 0 of 7 on both | our site, plus AlternativeTo and Unikorn in Gemini's answers, Unikorn once in ChatGPT's |

The pattern matches what others report: the assistants assemble an answer from the sources they retrieve for the question, mostly listicles, reviews and large established sites. A brand that is absent from those sources is absent from the answer. Our next step is to be present in the sources they already cite, then measure again.

## Limits

- 7 unnamed and 3 named prompts, one answer each, four runs. Small.
- Vietnamese prompts only, and two assistants only. Perplexity, Copilot and AI Overviews were not measured.
- Consumer accounts, so answers include personalisation we cannot see.
- The name matcher cannot count paraphrases such as "the open-source app". That would only raise a brand's count, never lower it.
- The Bing index check is a single observation on one day.

## Use the data

- [Answers, one row per prompt per assistant per run](../../data/ai-banner-visibility-2026-11-answers.csv) (80 rows, prompt text, brands named, order, whether the Oia website was named)
- [Summary by run, assistant and prompt group](../../data/ai-banner-visibility-2026-11-summary.csv) (16 rows, with Wilson intervals)

Both files are released under CC BY 4.0. If you cite them: "Oia, Which banner tools do ChatGPT and Gemini recommend?, November 2026, oia.solutions".

If you sell a tool, you can run the same test in an afternoon: write seven questions your buyers type that do not mention your name, ask two assistants, count which brands appear, and repeat next week with the same questions. That number is a better dashboard than any rank tracker.
