---
layout: page
title: 自架服務與用到的站
permalink: /services/
share-description: 我自己架的幾個 AI 服務，還有哪些站在用它們、怎麼用。
---

我自己架了幾個 AI 服務，很多站都在用。這頁記錄每個站用了哪些服務、怎麼用，有新的站就加上來。

盤點日期：{{ site.data.services.checked }}，從各 repo 的程式碼和 workflow 查的。

## 服務

{% for s in site.data.services.services %}
- **{% if s.repo %}[{{ s.name }}]({{ s.repo }}){% else %}{{ s.name }}{% endif %}**：{{ s.what }}{% if s.status %}（{{ s.status }}）{% endif %}
{%- endfor %}

## 站

{% for g in site.data.services.groups %}
{%- assign list = site.data.services.sites | where: "group", g.id -%}
{%- if list.size > 0 %}
### {{ g.title }}

| 站 | 服務 | 怎麼用 |
|---|---|---|
{% for x in list -%}
| {% if x.url %}[{{ x.name }}]({{ x.url }}){% else %}{{ x.name }}{% endif %}{% if x.repo %}（[repo]({{ x.repo }})）{% endif %} | {{ x.uses | join: "、" }} | {{ x.how }}{% if x.status %}（{{ x.status }}）{% endif %} |
{% endfor %}
{%- endif %}
{%- endfor %}

## 每個服務被誰用

{% for s in site.data.services.services -%}
{%- assign names = "" | split: "" -%}
{%- for x in site.data.services.sites -%}
{%- if x.uses contains s.id -%}{%- assign names = names | push: x.name -%}{%- endif -%}
{%- endfor %}
- **{{ s.name }}**（{{ names.size }}）：{% if names.size > 0 %}{{ names | join: "、" }}{% else %}目前還沒有公開的站在用{% endif %}
{%- endfor %}
