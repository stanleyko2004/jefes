import { Navigator, OrderArgs, CheckoutArgs } from './Navigator'
import * as path  from 'path'
import * as fs from 'fs'
require('dotenv').config();


const jsonOrderToArgs = (order: any): OrderArgs => {
    const item: string = order.menuItem.name
    const options: string[] = []
    order.foodOptions.map((object: any) => {
        object.options.map((option: any) => options.push(option.name))
    })
    const comment: string = order.comment
    const quantity: number = order.quantity
    return {
        item: item,
        options: options,
        comment: comment,
        quantity: quantity
    }
}

const orderFromFile = async (filename: string): Promise<void> => {
    let rawdata: string = fs.readFileSync(filename).toString()
    let json = JSON.parse(rawdata);

    const orderingArgs: OrderArgs[] = json.map((order: any) => jsonOrderToArgs(order))

    // console.log(orderingArgs);

    const firstName = 'toppings'
    const lastName = 'lastName' // idk???
    const email = 'raymondqin@toppingsapp.com'
    const phoneNumber = '6787101220'
    const tip = '0.00' // also idk???

    const paymentInfo: CheckoutArgs = {
        firstName: firstName,
        lastName: lastName,
        email: email,
        phoneNumber: phoneNumber,
        cardNumber: process.env.CREDIT_CARD_NUMBER!,
        cardExp: process.env.CREDIT_CARD_EXP!,
        cardCCV: process.env.CREDIT_CARD_CCV!,
        cardZip: process.env.CREDIT_CARD_ZIP!,
        tip: tip
    };

    // console.log(paymentInfo);

    const n = new Navigator('https://www.toasttab.com/el-jefes-taqueria/v3')
    const open = await n.init(false)
    if (open) {
        for (const args of orderingArgs) await n.addOrderToCart(args)
        await n.checkout(paymentInfo)
    }
    // await n.exit()
}

const input: string = './orders'
const files = fs.readdirSync(input)
const allOrders: Promise<void>[] = [];

(async () => {
    for (const file of files){
        const filename: string = path.join(input, file)
        // await orderFromFile(filename)
        allOrders.push(orderFromFile(filename))
    }
    Promise.all(allOrders)
})()