import * as puppeteer from "puppeteer";

export interface OrderArgs {
  item: string;
  options: string[];
  comment: string;
  quantity: number;
}

export interface CheckoutArgs {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  cardNumber: string;
  cardExp: string;
  cardCCV: string;
  cardZip: string;
  tip: string;
}

export class Navigator {
  url: string;
  menuItemToLink: Map<string, string>;
  browser: puppeteer.Browser;
  page: puppeteer.Page;
  modal: puppeteer.ElementHandle<Element>;

  constructor(url: string) {
    this.url = url.endsWith("/") ? url.slice(0, -1) : url;
    this.menuItemToLink = new Map<string, string>();
  }

  async init(headless: boolean): Promise<boolean> {
    this.browser = await puppeteer.launch({
      headless: headless,
      timeout: 120000,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--single-process',
      ]
    });
    this.page = await this.browser.newPage();
    await this.page.goto(this.url);
    await this.wait();
    const pageUrl: string = this.page.url();
    if (pageUrl.endsWith("/?mode=fulfillment")) {
      // console.log('Ordering Ahead of Time')
      await this.editOrderTime();
    }
    await this.makeMenuItemToLink();

    // const restaurantOpen: puppeteer.ElementHandle<Node>[] = await this.page.$x(`//span[normalize-space(text())="Open"]`)
    // if (restaurantOpen.length > 0){
    //     return true
    // } else {
    //     console.log('RESTAURANT NOT CURRENTLY TAKING ORDERS')
    //     await this.exit()
    //     return false
    // }
    return true;
    // const restaurantUnavailable: puppeteer.ElementHandle<Node>[] = await this.page.$x(`//span[normalize-space(text())="Online Ordering Unavailable"]`)
    // const restaurantClosed: puppeteer.ElementHandle<Node>[] = await this.page.$x(`//span[normalize-space(text())="Online Ordering Closed"]`)
    // const restaurantScheduledOrdersOnly: puppeteer.ElementHandle<Node>[] = await this.page.$x(`//span[normalize-space(text())="Scheduled Orders Only"]`)

    // if (restaurantUnavailable === [] && restaurantClosed === [] && restaurantScheduledOrdersOnly === []){
    //     return true
    // } else {
    //     console.log('RESTAURANT NOT CURRENTLY TAKING ORDERS')
    //     await this.exit()
    //     return false
    // }
  }

  async wait(): Promise<void> {
    await this.page.waitForNavigation({ waitUntil: "networkidle0" });
  }

  async makeMenuItemToLink(): Promise<void> {
    const itemToHref = async (
      item: puppeteer.ElementHandle<Node>
    ): Promise<void> => {
      const property: puppeteer.JSHandle<unknown> = await item.getProperty(
        "href"
      );
      const href: string = (await property.jsonValue()) as string;
      const name: string = await item.$eval(
        'span[data-testid="menu-item-name"]',
        (nameEl: any) => nameEl.innerText
      );
      // console.log(name, href)
      this.menuItemToLink.set(name, href);
    };

    const items: puppeteer.ElementHandle<Node>[] = await this.page.$$(
      'a[data-testid="menu-item-link"]'
    );
    const tasks: Promise<void>[] = [];
    for (const item of items) {
      tasks.push(itemToHref(item));
    }

    await Promise.all(tasks);
  }

  async editOrderTime(): Promise<void> {
    // sometimes modal pops up to let u order later when restaurant is closed
    const submitButton: puppeteer.JSHandle<unknown> | null = await this.page.$(
      'button[data-testid="fulfillment-selector-submit"]'
    );
    if (submitButton !== null)
      await submitButton.evaluate((button: any) => button.click());
  }

  async addOrderToCart(args: OrderArgs): Promise<void> {
    const { item, options, quantity, comment } = args;

    console.log('TRY ITEM');
    // item
    try {
      await this.page.goto(this.menuItemToLink.get(item)!);
      await this.wait();
      const element: puppeteer.ElementHandle<Element> | null =
        await this.page.$("#modal-root");
      this.modal = element!;
    } catch (e) {
      console.error("CANNOT FIND MENU ITEM: ", item);
      throw new Error('CANNOT FIND MENU ITEM' + item);
    }

    console.log('TRY OPTIONS');
    // options
    for (const option of options) {
      // console.log(option)
      try {
        // escape double quotes
        const escapedQuotes: string = option.includes('"') ? 'concat("' + option.replace(/"/g, `", '"', "`) + '")' : '"' + option + '"'
        console.log(escapedQuotes)
        // cuz toast sometimes adds random whitespace

        const [optionText] = await this.modal.$x(
          `//div[@data-testid="modifierDescription"]/div[normalize-space(text())=${escapedQuotes}]`
        );
        await optionText.evaluate((button: any) => button.click());
      } catch (e) {
        console.error("CANNOT FIND OPTION: ", option);
        console.error(e);
        throw new Error('CANNOT FIND OPTION' + option);
      }
    }

    console.log('TRY QUANTITY');
    // quantity
    try {
      if (quantity < 1) {
        console.error("QUANTITY CANNOT BE LESS THAN 1");
        throw new Error('QUANTITY CANNOT BE LESS THAN 1');
      }
      const incrementButton: puppeteer.ElementHandle<Element> | null =
        await this.modal.$('button[data-testid="increment"]');
      if (incrementButton !== null) {
        for (let i = 0; i < quantity - 1; i++)
          await incrementButton.evaluate((button: any) => button.click());
      } else {
        console.error("CANNOT INCREASE QUANTITY");
        throw new Error('CANNOT INCREASE QUANTITY');
      }
    } catch (e) {
      console.log(e);
      throw e;
    }

    console.log('TRY COMMENT');
    // comment
    try {
      const textArea: puppeteer.ElementHandle<Element> | null =
        await this.modal.$('textarea[id="specialInstructions"]');
      if (textArea !== null) {
        await textArea.type(comment);
      } else {
        console.log("CANNOT ENTER COMMENT");
        throw new Error('CANNOT ENTER COMMENT');
      }
    } catch (e) {
      console.log(e);
      throw e;
    }

    console.log('TRY CART');
    // add to cart
    try {
      const addToCartButton: puppeteer.ElementHandle<Element> | null =
        await this.modal.$('button[data-testid="add-to-cart-button"]');
      if (addToCartButton !== null) {
        await addToCartButton!.evaluate((button: any) => button.click());
      } else {
        console.log("CANNOT ADD TO CART");
        throw new Error('CANNOT ADD TO CART');
      }
    } catch (e) {
      console.log(e);
      throw e;
    }

    console.log('TRY WAIT');
    // waiting for page to redirect
    try {
      await this.wait();
    } catch (e) {
      console.log(e);
      throw e;
    }

    console.log('SUCCEED ADD CART');
  }

  async checkout(args: CheckoutArgs) {
    const {
      firstName,
      lastName,
      email,
      phoneNumber,
      cardNumber,
      cardExp,
      cardCCV,
      cardZip,
      tip,
    } = args;
    console.log('IN CHECKOUT');
    await this.page.goto(this.url + "/checkout");
    await this.wait();
    console.log('GOT TO PAGE');

    try {
      // can't async all this cuz puppeteer uses one cursor to fill in everything so it gets all messed up
      await this.page.type("#customer_first_name", firstName);
      await this.page.type("#customer_last_name", lastName);
      await this.page.type("#customer_email", email);
      await this.page.type("#customer_tel", phoneNumber);
    } catch (e) {
      console.log(e);
      throw e;
    }

    // TODO giftcard apply

    console.log('APPLY CREDIT CARD');
    try {
      const creditCardIframeElementHandle: puppeteer.ElementHandle<Element> | null =
        await this.page.$('iframe[data-testid="credit-card-iframe"]');
      if (creditCardIframeElementHandle !== null) {
        const creditCardIframe =
          await creditCardIframeElementHandle.contentFrame();
        await creditCardIframe!.type("#credit_card_number", cardNumber);
        await creditCardIframe!.type("#credit_card_exp", cardExp);
        await creditCardIframe!.type("#credit_card_cvv", cardCCV);
        await creditCardIframe!.type("#credit_card_zip", cardZip);
      } else {
        console.error("CANNOT FIND CREDIT CARD IFRAME");
        throw new Error("CANNOT FIND CREDIT CARD IFRAME");
      }
    } catch (e) {
      console.log(e);
      throw e;
    }

    // TODO promocard apply

    console.log('ADD TIP');
    try {
      await this.page.type("#payment_tip", tip);
    } catch (e) {
      console.log(e);
      throw e;
    }

    console.log('TRY SUBMIT');
    try {
      await this.page.waitForSelector('#submit-button:not([disabled])');

      const submitButton: puppeteer.ElementHandle<Element> | null =
        await this.page.$("#submit-button");
      if (submitButton === null) {
        console.log("CAN'T FIND SUBMIT BUTTON");
      } else {
        await Promise.all([
          submitButton.evaluate((button: any) => button.click()),
          this.page.waitForNavigation({waitUntil: 'networkidle2'})
        ]);
      }
    } catch (e) {
      console.log(e);
      throw e;
    }

    console.log('FINISHED CHECKOUT');
  }

  async exit() {
    await this.browser.close();
  }
}

if (require.main === module) {
  // basically python name==main
  (async () => {
    const n = new Navigator("https://www.toasttab.com/bacari-west-3rd/v3");
    await n.init(false);
    // await n.editOrderTime()
    // console.log(n.menuItemToLink)
    const order: OrderArgs = {
      item: "Asian Pear & Brie Pizza",
      options: ["Gluten-Free Dough"],
      comment: "my comment",
      quantity: 4,
    };
    await n.addOrderToCart(order);
    const c: CheckoutArgs = {
      firstName: "f",
      lastName: "l",
      email: "e",
      phoneNumber: "1",
      cardNumber: "1111111111",
      cardExp: "10/22",
      cardCCV: "111",
      cardZip: "99999",
      tip: "10.21",
    };
    await n.checkout(c);
    // await n.exit()
  })();
}
